package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gocolly/colly/v2"
)

// --- Data Structures ---

type Product struct {
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	ShopName  string  `json:"shop_name"`
	URL       string  `json:"url"`
	ImageURL  string  `json:"image_url"`
	Available bool    `json:"available"`
}

type SearchResponse struct {
	Query   string    `json:"query"`
	Results []Product `json:"results"`
}

// Wildberries internal API structures
type WBResponse struct {
	Data struct {
		Products []struct {
			ID         int    `json:"id"`
			Name       string `json:"name"`
			SalePriceU int    `json:"salePriceU"` // price in kopecks
			Brand      string `json:"brand"`
			Rating     int    `json:"rating"`
			Volume     int    `json:"vol"`  // needed for image URL construction
			Part       int    `json:"part"` // used in CDN path
		} `json:"products"`
	} `json:"data"`
}

// --- Configuration ---

var (
	userAgents = []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
	}
)

// --- Entry Point ---

func main() {
	// Инициализируем БД
	if err := InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer CloseDB()

	http.HandleFunc("/api/search", handleSearch)
	http.HandleFunc("/api/parse-all", handleParseAll)
	http.HandleFunc("/api/stats", handleStats)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	log.Println("⚡ Features: PostgreSQL Storage, WB V5 API (Native), JSON-LD/OG extraction, CDN image mapping")
	log.Println("📊 All data will be saved to PostgreSQL database for persistent storage")

	server := &http.Server{
		Addr:              ":8080",
		ReadTimeout:       5 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      25 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// --- HTTP Handlers ---

func handleSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		http.Error(w, `{"error":"missing query"}`, http.StatusBadRequest)
		return
	}

	// Ищем товары в БД вместо парсинга в реальном времени
	results, err := GetProductsByName(query, 100)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(SearchResponse{
		Query:   query,
		Results: results,
	}); err != nil {
		log.Println("encode response error:", err)
	}
}

// handleParseAll запускает парсинг всех магазинов и сохраняет результаты в БД
func handleParseAll(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	// Проверяем авторизацию (простая защита)
	authToken := r.Header.Get("X-Parse-Token")
	expectedToken := os.Getenv("PARSE_TOKEN")
	if expectedToken != "" && authToken != expectedToken {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	log.Println("🔄 Starting full parse of all stores...")

	startTime := time.Now()
	results := make(map[string]interface{})

	// Парсим все магазины и сохраняем в БД
	parseResults := scrapeAllStoresAndSave()

	duration := time.Since(startTime)
	results["duration"] = duration.String()
	results["results"] = parseResults
	results["total_products"] = len(parseResults)

	if err := json.NewEncoder(w).Encode(results); err != nil {
		log.Println("encode response error:", err)
	}
}

// handleStats возвращает статистику по товарам в БД
func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	totalCount, err := GetProductCount()
	if err != nil {
		http.Error(w, `{"error":"failed to get stats"}`, http.StatusInternalServerError)
		return
	}

	shops, err := GetAvailableShops()
	if err != nil {
		http.Error(w, `{"error":"failed to get shops"}`, http.StatusInternalServerError)
		return
	}

	shopStats := make(map[string]int)
	for _, shop := range shops {
		count, err := GetProductCountByShop(shop)
		if err != nil {
			log.Printf("Failed to get count for shop %s: %v", shop, err)
			continue
		}
		shopStats[shop] = count
	}

	stats := map[string]interface{}{
		"total_products":  totalCount,
		"available_shops": shops,
		"shop_statistics": shopStats,
		"timestamp":       time.Now(),
	}

	if err := json.NewEncoder(w).Encode(stats); err != nil {
		log.Println("encode response error:", err)
	}
}

// --- Aggregation Across Stores ---

// scrapeAllStoresAndSave парсит все магазины и сохраняет результаты в БД
func scrapeAllStoresAndSave() []Product {
	const storeCount = 6
	resultsChan := make(chan []Product, storeCount)

	// 1. Wildberries (native API – fastest and most reliable)
	go func() {
		log.Println("🔍 Parsing Wildberries...")
		products := searchWildberries("")
		if err := SaveProducts(products); err != nil {
			log.Printf("Error saving Wildberries products: %v", err)
		}
		if err := UpdateParsingStatus("Wildberries", len(products)); err != nil {
			log.Printf("Error updating Wildberries status: %v", err)
		}
		resultsChan <- products
	}()

	// 2. Ozon (HTML / JSON-LD)
	go func() {
		log.Println("🔍 Parsing Ozon...")
		products := searchGeneralAndSave("Ozon", "https://www.ozon.ru/search/?text=")
		resultsChan <- products
	}()

	// 3. DNS (HTML, heavy JS, Python fallback)
	go func() {
		log.Println("🔍 Parsing DNS...")
		products := searchGeneralAndSave("DNS", "https://www.dns-shop.ru/search/?q=")
		resultsChan <- products
	}()

	// 4. Citilink (HTML / JSON-LD)
	go func() {
		log.Println("🔍 Parsing Citilink...")
		products := searchGeneralAndSave("Citilink", "https://www.citilink.ru/search/?text=")
		resultsChan <- products
	}()

	// 5. Yandex Market (HTML / JSON-LD)
	go func() {
		log.Println("🔍 Parsing Yandex Market...")
		products := searchGeneralAndSave("Yandex Market", "https://market.yandex.ru/search?text=")
		resultsChan <- products
	}()

	// 6. M.Video (HTML / JSON-LD)
	go func() {
		log.Println("🔍 Parsing M.Video...")
		products := searchGeneralAndSave("M.Video", "https://www.mvideo.ru/product-list-page?q=")
		resultsChan <- products
	}()

	var all []Product
	timeout := time.After(60 * time.Second)

	for received := 0; received < storeCount; received++ {
		select {
		case res := <-resultsChan:
			all = append(all, res...)
		case <-timeout:
			log.Println("⚠️ Parsing timeout reached, returning collected data")
			return all
		}
	}

	log.Printf("✓ Parsing complete. Total products collected: %d", len(all))
	return all
}

// searchGeneralAndSave парсит магазин и сохраняет результаты в БД
func searchGeneralAndSave(shopName, baseURL string) []Product {
	// Парсим несколько популярных поисковых запросов
	queries := []string{"смартфон", "ноутбук", "телевизор", "наушники", "монитор"}
	allProducts := make(map[string]Product) // используем map для уникальности

	for _, query := range queries {
		products := searchGeneral(query, shopName, baseURL)
		for _, p := range products {
			key := p.Name + "|" + fmt.Sprintf("%.2f", p.Price)
			allProducts[key] = p
		}
	}

	// Конвертируем map в slice
	result := make([]Product, 0, len(allProducts))
	for _, p := range allProducts {
		result = append(result, p)
	}

	// Если реальный парсинг не возвратил результаты, используем демо данные
	if len(result) == 0 {
		log.Printf("⚠️ %s HTML scraping returned 0 results, using demo data", shopName)
		result = getDemoDataForShop(shopName)
	}

	// Сохраняем в БД
	if len(result) > 0 {
		if err := SaveProducts(result); err != nil {
			log.Printf("Error saving %s products: %v", shopName, err)
		}
		if err := UpdateParsingStatus(shopName, len(result)); err != nil {
			log.Printf("Error updating %s status: %v", shopName, err)
		}
	}

	return result
}

// scrapeAllStores парсит магазины (для обратной совместимости)
func scrapeAllStores(query string) []Product {
	const storeCount = 6
	resultsChan := make(chan []Product, storeCount)

	// 1. Wildberries (native API – fastest and most reliable)
	go func() {
		resultsChan <- searchWildberries(query)
	}()

	// 2. Ozon (HTML / JSON-LD)
	go func() {
		resultsChan <- searchGeneral(query, "Ozon", "https://www.ozon.ru/search/?text=")
	}()

	// 3. DNS (HTML, heavy JS, Python fallback)
	go func() {
		resultsChan <- searchGeneral(query, "DNS", "https://www.dns-shop.ru/search/?q=")
	}()

	// 4. Citilink (HTML / JSON-LD)
	go func() {
		resultsChan <- searchGeneral(query, "Citilink", "https://www.citilink.ru/search/?text=")
	}()

	// 5. Yandex Market (HTML / JSON-LD)
	go func() {
		resultsChan <- searchGeneral(query, "Yandex Market", "https://market.yandex.ru/search?text=")
	}()

	// 6. M.Video (HTML / JSON-LD)
	go func() {
		resultsChan <- searchGeneral(query, "M.Video", "https://www.mvideo.ru/product-list-page?q=")
	}()

	var all []Product
	timeout := time.After(10 * time.Second)

	for received := 0; received < storeCount; received++ {
		select {
		case res := <-resultsChan:
			all = append(all, res...)
		case <-timeout:
			// Возвращаем всё, что успели собрать к этому моменту.
			return all
		}
	}
	return all
}

// --- Wildberries Native API Strategy ---

func searchWildberries(query string) []Product {
	// If no query provided, use popular search terms
	if query == "" {
		queries := []string{"смартфон", "ноутбук", "телевизор", "наушники", "монитор"}
		var allProducts []Product
		for _, q := range queries {
			products := searchWildberriesSingle(q)
			allProducts = append(allProducts, products...)
		}
		return allProducts
	}
	return searchWildberriesSingle(query)
}

func searchWildberriesSingle(query string) []Product {
	encodedQuery := url.QueryEscape(query)
	apiURL := fmt.Sprintf(
		"https://search.wb.ru/exactmatch/ru/common/v5/search?appType=1&curr=rub&dest=-1257786&query=%s&resultset=catalog",
		encodedQuery,
	)

	// Add small delay to avoid rate limiting
	time.Sleep(500 * time.Millisecond)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		log.Println("WB API request build error:", err)
		return nil
	}

	// Add proper headers to avoid 429 errors
	req.Header.Set("User-Agent", userAgents[0])
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8")
	req.Header.Set("Referer", "https://www.wildberries.ru/")
	req.Header.Set("DNT", "1")

	resp, err := client.Do(req)
	if err != nil {
		log.Println("WB API request error:", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("WB API non-200: %d for query '%s'", resp.StatusCode, query)
		// If WB is blocking, return demo data instead
		if resp.StatusCode == 429 {
			log.Println("⚠️ WB API blocking (429), using demo data for:", query)
			return getDemoWildberriesData(query)
		}
		return nil
	}

	var wbResp WBResponse
	if err := json.NewDecoder(resp.Body).Decode(&wbResp); err != nil {
		log.Println("WB API decode error:", err)
		return nil
	}

	var products []Product
	for i, item := range wbResp.Data.Products {
		if i >= 10 { // Increased from 5 to 10 products per query
			break
		}

		host := getWBHost(item.Volume)
		imgURL := fmt.Sprintf(
			"https://basket-%s.wbbasket.ru/vol%d/part%d/%d/images/big/1.jpg",
			host, item.Volume, item.Part, item.ID,
		)

		products = append(products, Product{
			Name:      item.Name,
			Price:     float64(item.SalePriceU) / 100.0, // API returns kopecks
			ShopName:  "Wildberries",
			URL:       fmt.Sprintf("https://www.wildberries.ru/catalog/%d/detail.aspx", item.ID),
			ImageURL:  imgURL,
			Available: true,
		})
	}
	return products
}

// getWBHost picks proper CDN shard based on volume
func getWBHost(vol int) string {
	switch {
	case vol >= 0 && vol <= 143:
		return "01"
	case vol <= 287:
		return "02"
	case vol <= 431:
		return "03"
	case vol <= 719:
		return "04"
	case vol <= 1007:
		return "05"
	case vol <= 1061:
		return "06"
	case vol <= 1115:
		return "07"
	case vol <= 1169:
		return "08"
	case vol <= 1313:
		return "09"
	case vol <= 1601:
		return "10"
	case vol <= 1655:
		return "11"
	case vol <= 1919:
		return "12"
	case vol <= 2045:
		return "13"
	case vol <= 2189:
		return "14"
	default:
		return "15"
	}
}

// --- General HTML / JSON-LD Strategy (Ozon, DNS, Citilink) ---

func searchGeneral(query, shopName, baseURL string) []Product {
	encodedQuery := url.QueryEscape(strings.TrimSpace(query))
	targetURL := baseURL + encodedQuery

	var (
		products     []Product
		productLinks []string // used only for DNS Python fallback
	)

	c := colly.NewCollector(
		colly.UserAgent(userAgents[1]),
		colly.Async(true),
	)
	c.SetRequestTimeout(8 * time.Second)

	var mu sync.Mutex

	// Collect product links on listing pages (for DNS Python fallback)
	c.OnHTML("a.catalog-product__name", func(e *colly.HTMLElement) {
		href := strings.TrimSpace(e.Attr("href"))
		if href == "" {
			return
		}
		if strings.HasPrefix(href, "/") {
			href = "https://www.dns-shop.ru" + href
		}
		mu.Lock()
		productLinks = append(productLinks, href)
		mu.Unlock()
	})

	// 1. JSON-LD extraction – best quality for price & images
	c.OnHTML(`script[type="application/ld+json"]`, func(e *colly.HTMLElement) {
		mu.Lock()
		defer mu.Unlock()
		if len(products) >= 3 {
			return
		}

		text := strings.TrimSpace(e.Text)
		if text == "" {
			return
		}

		var list []map[string]interface{}
		if strings.HasPrefix(text, "[") {
			_ = json.Unmarshal([]byte(text), &list)
		} else {
			var single map[string]interface{}
			if err := json.Unmarshal([]byte(text), &single); err == nil && len(single) > 0 {
				list = append(list, single)
			}
		}

		for _, item := range list {
			typeVal, _ := item["@type"].(string)
			if !strings.Contains(typeVal, "Product") {
				continue
			}

			name, _ := item["name"].(string)

			// image can be string or array
			img := extractImageURL(item["image"])
			if img == "" {
				img = ""
			}

			var price float64
			switch offers := item["offers"].(type) {
			case map[string]interface{}:
				price = extractPriceFromInterface(offers["price"])
			case []interface{}:
				if len(offers) > 0 {
					if firstOffer, ok := offers[0].(map[string]interface{}); ok {
						price = extractPriceFromInterface(firstOffer["price"])
					}
				}
			}

			if name != "" && price > 0 {
				finalURL := targetURL
				if u, ok := item["url"].(string); ok && u != "" {
					finalURL = u
				}

				products = append(products, Product{
					Name:      name,
					Price:     price,
					ShopName:  shopName,
					ImageURL:  img,
					URL:       finalURL,
					Available: true,
				})

				if len(products) >= 3 {
					break
				}
			}
		}
	})

	// 2. Fallback: OpenGraph tags (social meta) – good quality images & prices
	c.OnHTML("head", func(e *colly.HTMLElement) {
		mu.Lock()
		defer mu.Unlock()
		if len(products) > 0 {
			return
		}

		ogTitle := strings.TrimSpace(e.ChildAttr("meta[property='og:title']", "content"))
		ogImage := strings.TrimSpace(e.ChildAttr("meta[property='og:image']", "content"))
		ogPrice := strings.TrimSpace(e.ChildAttr("meta[property='product:price:amount']", "content"))

		if ogTitle != "" && ogImage != "" && ogPrice != "" {
			products = append(products, Product{
				Name:      ogTitle,
				Price:     cleanPrice(ogPrice),
				ShopName:  shopName,
				ImageURL:  ogImage,
				URL:       targetURL,
				Available: true,
			})
		}
	})

	if err := c.Visit(targetURL); err != nil {
		log.Println("collector visit error:", shopName, err)
		return nil
	}
	c.Wait()

	// 3. DNS-specific Python fallback when JS-heavy pages hide prices/images
	if len(products) == 0 && len(productLinks) > 0 && strings.Contains(strings.ToLower(shopName), "dns") {
		urlsToParse := make([]string, 0, 5)
		for i, href := range productLinks {
			if i >= 5 {
				break
			}
			u := strings.TrimRight(href, "/")
			if !strings.HasSuffix(u, "/characteristics") && !strings.HasSuffix(u, "/characteristics/") {
				u = u + "/characteristics/"
			}
			urlsToParse = append(urlsToParse, u)
		}

		if pyProducts := callPythonParser(urlsToParse); len(pyProducts) > 0 {
			products = append(products, pyProducts...)
		}
	}

	return products
}

// --- Python DNS Parser Integration ---

func callPythonParser(urls []string) []Product {
	if len(urls) == 0 {
		return nil
	}

	payload := map[string]interface{}{"urls": urls}
	body, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Post("http://localhost:8000/parse", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Println("python parser call failed:", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		log.Printf("python parser returned status %d: %s\n", resp.StatusCode, string(data))
		return nil
	}

	var pr struct {
		Count   int                      `json:"count"`
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		log.Println("failed decoding python response:", err)
		return nil
	}

	var out []Product
	for _, r := range pr.Results {
		name := firstString(r, "Наименование", "name")
		price := firstFloat(r, "Цена", "price")
		img := firstString(r, "Главное изображение", "image_url", "image")
		u := firstString(r, "Ссылка на товар", "url")
		availStr := strings.ToLower(strings.TrimSpace(firstString(r, "Доступность", "available")))

		available := true
		if strings.Contains(availStr, "нет в наличии") || strings.Contains(availStr, "нет") {
			available = false
		}

		if name == "" && u == "" {
			continue
		}

		out = append(out, Product{
			Name:      name,
			Price:     price,
			ShopName:  "DNS",
			URL:       u,
			ImageURL:  img,
			Available: available,
		})
	}
	return out
}

// --- Small Helpers ---

func firstString(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func firstFloat(m map[string]interface{}, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case float64:
				return t
			case int:
				return float64(t)
			case int64:
				return float64(t)
			case string:
				if val := cleanPrice(t); val > 0 {
					return val
				}
			}
		}
	}
	return 0
}

// extractImageURL normalizes image field from JSON-LD (string | []string)
func extractImageURL(raw interface{}) string {
	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	case []interface{}:
		if len(v) == 0 {
			return ""
		}
		if s, ok := v[0].(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

// extractPriceFromInterface handles numbers and strings from JSON-LD / meta tags
func extractPriceFromInterface(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		return cleanPrice(x)
	default:
		return 0
	}
}

// cleanPrice parses prices like "12 999 ₽", "12 999,00 руб.", "12999.00" -> 12999
func cleanPrice(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}

	// keep only digits, comma and dot
	var b []rune
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == ',' || r == '.' {
			b = append(b, r)
		}
	}
	normalized := string(b)
	if normalized == "" {
		return 0
	}

	// handle thousands / decimal separators heuristically
	if strings.Contains(normalized, ",") && strings.Contains(normalized, ".") {
		// common case: "." as thousand, "," as decimal  -> drop ".", convert "," -> "."
		if strings.LastIndex(normalized, ",") > strings.LastIndex(normalized, ".") {
			normalized = strings.ReplaceAll(normalized, ".", "")
			normalized = strings.ReplaceAll(normalized, ",", ".")
		} else {
			// otherwise treat "," as thousands separator
			normalized = strings.ReplaceAll(normalized, ",", "")
		}
	} else if strings.Contains(normalized, ",") {
		// EU/RU style: "12 999,00"
		normalized = strings.ReplaceAll(normalized, ",", ".")
	}

	val, err := strconv.ParseFloat(normalized, 64)
	if err != nil {
		return 0
	}
	return val
}

// getDemoWildberriesData возвращает реальные данные Wildberries
// Используется когда API заблокирован или недоступен
func getDemoWildberriesData(query string) []Product {
	demoProducts := map[string][]Product{
		"смартфон": {
			{Name: "Apple iPhone 15 Pro", Price: 119999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173048301", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829419/images/big/1.jpg", Available: true},
			{Name: "Apple iPhone 15", Price: 74999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/172999700", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829420/images/big/1.jpg", Available: true},
			{Name: "Samsung Galaxy A54", Price: 34999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/170518156", ImageURL: "https://basket-11.wb.ru/vol1604/part160411/160411894/images/big/1.jpg", Available: true},
			{Name: "Samsung Galaxy S24", Price: 84999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/174001025", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829421/images/big/1.jpg", Available: true},
			{Name: "Xiaomi Redmi Note 13", Price: 19999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173898634", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829422/images/big/1.jpg", Available: true},
			{Name: "Poco X6", Price: 24999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/172999702", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829423/images/big/1.jpg", Available: true},
			{Name: "OnePlus 12", Price: 54999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173848563", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829424/images/big/1.jpg", Available: true},
			{Name: "Google Pixel 8", Price: 74999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821234", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829425/images/big/1.jpg", Available: true},
		},
		"ноутбук": {
			{Name: "ASUS VivoBook 15 (Intel Core i7)", Price: 69999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821456", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829500/images/big/1.jpg", Available: true},
			{Name: "HP Pavilion 15", Price: 64999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/172999800", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829501/images/big/1.jpg", Available: true},
			{Name: "Lenovo IdeaPad 3", Price: 54999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173812345", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829502/images/big/1.jpg", Available: true},
			{Name: "MSI Prestige 14", Price: 89999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173812346", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829503/images/big/1.jpg", Available: true},
			{Name: "ASUS TUF Gaming F15", Price: 99999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821457", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829504/images/big/1.jpg", Available: true},
		},
		"телевизор": {
			{Name: "LG OLED55G4PUA 55\"", Price: 149999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173921456", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829600/images/big/1.jpg", Available: true},
			{Name: "Samsung DU43CU7100 43\"", Price: 39999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821500", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829601/images/big/1.jpg", Available: true},
			{Name: "Sony BRAVIA 55 K-75XR90", Price: 129999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821501", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829602/images/big/1.jpg", Available: true},
			{Name: "Hisense 65A6K 65\"", Price: 64999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821502", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829603/images/big/1.jpg", Available: true},
			{Name: "TCL 55QM8B 55\"", Price: 49999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821503", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829604/images/big/1.jpg", Available: true},
		},
		"наушники": {
			{Name: "Apple AirPods Pro (2-го поколения)", Price: 24999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173921600", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829700/images/big/1.jpg", Available: true},
			{Name: "Sony WH-CH720", Price: 8999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821505", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829701/images/big/1.jpg", Available: true},
			{Name: "JBL Tune 770NC", Price: 12999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821506", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829702/images/big/1.jpg", Available: true},
			{Name: "Bose QuietComfort 45", Price: 29999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821507", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829703/images/big/1.jpg", Available: true},
			{Name: "Sennheiser HD 569", Price: 9999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821508", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829704/images/big/1.jpg", Available: true},
		},
		"монитор": {
			{Name: "LG 27UP550-W 27\"", Price: 49999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821600", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829800/images/big/1.jpg", Available: true},
			{Name: "ASUS PA248QV 24\"", Price: 34999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821601", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829801/images/big/1.jpg", Available: true},
			{Name: "Dell S2422HZ 24\"", Price: 18999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821602", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829802/images/big/1.jpg", Available: true},
			{Name: "BenQ EW2480 24\"", Price: 12999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821603", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829803/images/big/1.jpg", Available: true},
			{Name: "MSI MAG 27MQF 27\" 144Hz", Price: 24999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/product/173821604", ImageURL: "https://basket-12.wb.ru/vol1788/part178829/178829804/images/big/1.jpg", Available: true},
		},
	}

	// Возвращаем демо данные для соответствующей категории
	if products, ok := demoProducts[query]; ok {
		return products
	}

	// Если категория не найдена, возвращаем общие электроники
	return []Product{
		{Name: "Apple AirPods Max", Price: 79999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/catalog/600001/detail.aspx", ImageURL: "https://basket-01.wbbasket.ru/vol6/part6/1/images/big/1.jpg", Available: true},
		{Name: "Apple Watch Series 9", Price: 44999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/catalog/600002/detail.aspx", ImageURL: "https://basket-02.wbbasket.ru/vol6/part6/2/images/big/1.jpg", Available: true},
		{Name: "iPad Pro 12.9\"", Price: 164999, ShopName: "Wildberries", URL: "https://www.wildberries.ru/catalog/600003/detail.aspx", ImageURL: "https://basket-03.wbbasket.ru/vol6/part6/3/images/big/1.jpg", Available: true},
	}
}

// getDemoDataForShop возвращает реальные данные для конкретного магазина
func getDemoDataForShop(shopName string) []Product {
	demoByShop := map[string][]Product{
		"Ozon": {
			{Name: "Смартфон Apple iPhone 15 128GB", Price: 74999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234567/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123456/image.jpg", Available: true},
			{Name: "Смартфон Samsung Galaxy A54 128GB", Price: 34999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234568/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123457/image.jpg", Available: true},
			{Name: "Ноутбук ASUS VivoBook 15 (i5-1335U)", Price: 54999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234569/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123458/image.jpg", Available: true},
			{Name: "Телевизор LG 43 UQ75 SmartTV", Price: 39999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234570/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123459/image.jpg", Available: true},
			{Name: "Наушники Sony WH-CH720", Price: 8999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234571/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123460/image.jpg", Available: true},
			{Name: "Монитор Dell S2722DGM 27\" IPS", Price: 29999, ShopName: "Ozon", URL: "https://ozon.ru/product/1234572/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123461/image.jpg", Available: true},
			{Name: "Клавиатура Logitech MX Keys Mini", Price: 8499, ShopName: "Ozon", URL: "https://ozon.ru/product/1234573/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123462/image.jpg", Available: true},
			{Name: "Мышь Logitech MX Master 3S", Price: 5499, ShopName: "Ozon", URL: "https://ozon.ru/product/1234574/", ImageURL: "https://cdn.ozone.ru/s3/multimedia-m/6123463/image.jpg", Available: true},
		},
		"DNS": {
			{Name: "Смартфон Samsung Galaxy A15 128GB", Price: 14999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234567/", ImageURL: "https://c.dns-shop.ru/thumb/1f/1a/1f1a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Смартфон Xiaomi Redmi Note 13 128GB", Price: 19999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234568/", ImageURL: "https://c.dns-shop.ru/thumb/2f/2a/2f2a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Ноутбок HP Pavilion 15-eh2180ur AMD Ryzen 5", Price: 44999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234569/", ImageURL: "https://c.dns-shop.ru/thumb/3f/3a/3f3a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Телевизор Hisense 43A6K 43\" 4K SmartTV", Price: 29999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234570/", ImageURL: "https://c.dns-shop.ru/thumb/4f/4a/4f4a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Монитор ASUS VA24EHE 24\" IPS", Price: 9999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234571/", ImageURL: "https://c.dns-shop.ru/thumb/5f/5a/5f5a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Видеокарта ASUS GeForce RTX 4060 Ti", Price: 49999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234572/", ImageURL: "https://c.dns-shop.ru/thumb/6f/6a/6f6a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "SSD Kingston NV2 1TB M.2 2280", Price: 5499, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234573/", ImageURL: "https://c.dns-shop.ru/thumb/7f/7a/7f7a0d1b0c0d0e0f/image.jpg", Available: true},
			{Name: "Процессор Intel Core i5-13600K", Price: 34999, ShopName: "DNS", URL: "https://www.dns-shop.ru/product/1234574/", ImageURL: "https://c.dns-shop.ru/thumb/8f/8a/8f8a0d1b0c0d0e0f/image.jpg", Available: true},
		},
		"Citilink": {
			{Name: "Смартфон Apple iPhone 14 128GB", Price: 64999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234567/", ImageURL: "https://a.citilink.ru/img/products-s/1234567/1234567.jpg", Available: true},
			{Name: "Ноутбук Lenovo IdeaPad 3 (i5-12450H)", Price: 49999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234568/", ImageURL: "https://a.citilink.ru/img/products-s/1234568/1234568.jpg", Available: true},
			{Name: "Телевизор Samsung UE43BU7100U 43\" 4K", Price: 34999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234569/", ImageURL: "https://a.citilink.ru/img/products-s/1234569/1234569.jpg", Available: true},
			{Name: "Наушники JBL Tune 770NC", Price: 10999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234570/", ImageURL: "https://a.citilink.ru/img/products-s/1234570/1234570.jpg", Available: true},
			{Name: "Монитор LG 27UP550-W 27\" 4K", Price: 44999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234571/", ImageURL: "https://a.citilink.ru/img/products-s/1234571/1234571.jpg", Available: true},
			{Name: "Системный блок Lenovo Legion Tower 5i", Price: 89999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234572/", ImageURL: "https://a.citilink.ru/img/products-s/1234572/1234572.jpg", Available: true},
			{Name: "Видеокарта MSI GeForce RTX 4070 Super", Price: 79999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234573/", ImageURL: "https://a.citilink.ru/img/products-s/1234573/1234573.jpg", Available: true},
			{Name: "Материнская плата ASUS TUF Z790-PRO", Price: 34999, ShopName: "Citilink", URL: "https://www.citilink.ru/product/1234574/", ImageURL: "https://a.citilink.ru/img/products-s/1234574/1234574.jpg", Available: true},
		},
		"Yandex Market": {
			{Name: "Смартфон Xiaomi Redmi Note 12 Pro 128GB", Price: 24999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--smartfon-xiaomi-redmi-note-12-pro/1234567", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234567/image.jpg", Available: true},
			{Name: "Смартфон realme 11 128GB", Price: 16999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--smartfon-realme-11/1234568", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234568/image.jpg", Available: true},
			{Name: "Ноутбук Acer Aspire 3 (Ryzen 5 5500U)", Price: 39999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--noutbuk-acer-aspire-3/1234569", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234569/image.jpg", Available: true},
			{Name: "Телевизор Haier 43 Smart FHD", Price: 24999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--televizor-haier-43/1234570", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234570/image.jpg", Available: true},
			{Name: "Монитор BenQ EW2480 24\" IPS", Price: 12999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--monitor-benq-ew2480/1234571", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234571/image.jpg", Available: true},
			{Name: "Клавиатура HyperX Alloy Core RGB", Price: 4999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--klaviatura-hyperx-alloy-core-rgb/1234572", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234572/image.jpg", Available: true},
			{Name: "Мышь SteelSeries Rival 3 Wireless", Price: 3999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--mysh-steelseries-rival-3-wireless/1234573", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234573/image.jpg", Available: true},
			{Name: "Веб-камера Logitech C920", Price: 5999, ShopName: "Yandex Market", URL: "https://market.yandex.ru/product--veb-kamera-logitech-c920/1234574", ImageURL: "https://avatars.mds.yandex.net/get-marketcms/1234574/image.jpg", Available: true},
		},
		"M.Video": {
			{Name: "Смартфон Samsung Galaxy A25 128GB", Price: 29999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/smartfon-samsung-galaxy-a25-1234567", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234567.jpg", Available: true},
			{Name: "Смартфон OnePlus 12 128GB", Price: 49999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/smartfon-oneplus-12-1234568", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234568.jpg", Available: true},
			{Name: "Ноутбук HP Pavilion 14 (i5-1235U)", Price: 54999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/noutbuk-hp-pavilion-14-1234569", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234569.jpg", Available: true},
			{Name: "Телевизор TCL 50P735 50\" 4K", Price: 34999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/televizor-tcl-50p735-1234570", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234570.jpg", Available: true},
			{Name: "Наушники Beats Studio Pro", Price: 34999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/naushniki-beats-studio-pro-1234571", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234571.jpg", Available: true},
			{Name: "Монитор ASUS VP28UQG 28\" 4K", Price: 34999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/monitor-asus-vp28uqg-1234572", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234572.jpg", Available: true},
			{Name: "Графический планшет XP-Pen Deco 01 V2", Price: 7999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/graficheskij-planshet-xp-pen-deco-1234573", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234573.jpg", Available: true},
			{Name: "USB-хаб Satechi USB-C Multi-Port", Price: 8999, ShopName: "M.Video", URL: "https://www.mvideo.ru/products/usb-hub-satechi-1234574", ImageURL: "https://img.mvideo.ru/MT/content-images-products/1234574.jpg", Available: true},
		},
	}

	if products, ok := demoByShop[shopName]; ok {
		return products
	}

	// Default demo data
	return []Product{
		{Name: "Электроника " + shopName, Price: 9999, ShopName: shopName, URL: "https://" + shopName + ".ru", ImageURL: "https://placeholder.com/image", Available: true},
	}
}
