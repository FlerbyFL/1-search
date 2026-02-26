package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
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
	http.HandleFunc("/api/search", handleSearch)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	log.Println("⚡ Features: WB V5 API (Native), JSON-LD/OG extraction, CDN image mapping")

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

	results := scrapeAllStores(query)

	if err := json.NewEncoder(w).Encode(SearchResponse{
		Query:   query,
		Results: results,
	}); err != nil {
		log.Println("encode response error:", err)
	}
}

// --- Aggregation Across Stores ---

func scrapeAllStores(query string) []Product {
	// Собираем результаты из всех магазинов параллельно, но с общим таймаутом,
	// чтобы один "висящий" магазин не блокировал весь ответ.
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
	encodedQuery := url.QueryEscape(query)
	apiURL := fmt.Sprintf(
		"https://search.wb.ru/exactmatch/ru/common/v5/search?appType=1&curr=rub&dest=-1257786&query=%s&resultset=catalog",
		encodedQuery,
	)

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		log.Println("WB API request build error:", err)
		return nil
	}
	req.Header.Set("User-Agent", userAgents[0])

	resp, err := client.Do(req)
	if err != nil {
		log.Println("WB API request error:", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Println("WB API non-200:", resp.StatusCode)
		return nil
	}

	var wbResp WBResponse
	if err := json.NewDecoder(resp.Body).Decode(&wbResp); err != nil {
		log.Println("WB API decode error:", err)
		return nil
	}

	var products []Product
	for i, item := range wbResp.Data.Products {
		if i >= 5 {
			break // keep it fast, top 5 results
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

