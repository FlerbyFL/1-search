package parsers

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"

	"backend/parser/internal/models"

	"golang.org/x/net/html/charset"
)

// Parser is the interface all shop parsers must implement
type Parser interface {
	Name() string
	ParseCategory(categoryURL string) ([]models.ParseResult, error)
	ParseProduct(productURL string) (models.ParseResult, error)
}

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
}

func randomUserAgent() string {
	return userAgents[rand.Intn(len(userAgents))]
}

// HTTPClient is a configured HTTP client with retry logic and decompression
type HTTPClient struct {
	client *http.Client
}

func NewHTTPClient() *HTTPClient {
	jar, _ := cookiejar.New(nil)
	return &HTTPClient{
		client: &http.Client{
			Timeout: 30 * time.Second,
			Jar:     jar,
			// Allow redirects but limit
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("stopped after 5 redirects")
				}
				return nil
			},
		},
	}
}

func (c *HTTPClient) Get(url string, headers map[string]string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			delay := time.Duration(attempt*3+rand.Intn(3)) * time.Second
			time.Sleep(delay)
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}

		req.Header.Set("User-Agent", randomUserAgent())
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8")
		// Tell server we accept gzip — and we'll decompress it ourselves
		req.Header.Set("Accept-Encoding", "gzip")
		req.Header.Set("Connection", "keep-alive")
		req.Header.Set("Cache-Control", "no-cache")

		for k, v := range headers {
			req.Header.Set(k, v)
		}

		resp, err := c.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode == 429 {
			resp.Body.Close()
			lastErr = fmt.Errorf("rate limited (429)")
			time.Sleep(time.Duration(15+rand.Intn(20)) * time.Second)
			continue
		}
		if resp.StatusCode >= 500 {
			resp.Body.Close()
			lastErr = fmt.Errorf("server error: %d", resp.StatusCode)
			continue
		}

		body, err := readAndDecompress(resp)
		if err != nil {
			lastErr = err
			continue
		}

		return body, nil
	}
	return nil, fmt.Errorf("all attempts failed for %s: %w", url, lastErr)
}

// readAndDecompress handles gzip and identity encoding
func readAndDecompress(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()

	var reader io.Reader = resp.Body

	encoding := strings.ToLower(resp.Header.Get("Content-Encoding"))
	switch encoding {
	case "gzip":
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			// Maybe body itself starts with gzip magic bytes even without header
			return nil, fmt.Errorf("gzip reader: %w", err)
		}
		defer gz.Close()
		reader = gz
	case "br":
		// brotli — fallback: just read raw (rare in API responses)
		reader = resp.Body
	default:
		// Check magic bytes for gzip even if header missing
		buf := make([]byte, 2)
		n, _ := resp.Body.Read(buf)
		combined := io.MultiReader(bytes.NewReader(buf[:n]), resp.Body)
		if n == 2 && buf[0] == 0x1f && buf[1] == 0x8b {
			gz, err := gzip.NewReader(combined)
			if err == nil {
				defer gz.Close()
				reader = gz
			} else {
				reader = combined
			}
		} else {
			reader = combined
		}
	}

	// Detect charset and convert to UTF-8
	contentType := resp.Header.Get("Content-Type")
	utf8Reader, err := charset.NewReader(reader, contentType)
	if err != nil {
		utf8Reader = reader
	}

	return io.ReadAll(utf8Reader)
}

// cleanPrice removes non-numeric characters from price string
func cleanPrice(s string) float64 {
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "\u00a0", "")
	s = strings.ReplaceAll(s, "\u202f", "")
	s = strings.ReplaceAll(s, "₽", "")
	s = strings.ReplaceAll(s, "руб", "")
	s = strings.ReplaceAll(s, "р.", "")
	s = strings.TrimSpace(s)
	// Remove everything after comma/dot for simple int prices
	var price float64
	fmt.Sscanf(s, "%f", &price)
	return price
}

func init() {
	rand.Seed(time.Now().UnixNano())
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		return string(b[:n])
	}
	return string(b)
}
