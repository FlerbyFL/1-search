# -*- coding: utf-8 -*-
"""
Playwright parser for PiterGSM (pitergsm.ru).
Pagination: standard numbered pages + "Show more" button.
JSON-LD: mainEntity.itemListElement[].item (Product with offers)
"""

import io
import json
import re
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


def clean_price(text):
    digits = re.sub(r"[^\d]", "", str(text))
    try:
        return int(digits)
    except Exception:
        return 0


def to_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def to_float(value, default=0.0):
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace(",", ".").strip()
        return float(value)
    except Exception:
        return default


def normalize_image_url(url):
    if not isinstance(url, str):
        return ""
    url = url.strip()
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("/"):
        return f"https://pitergsm.ru{url}"
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return ""


def detect_category(url, name):
    text = (url + " " + name).lower()
    if any(k in text for k in ["iphone", "smartphone", "смартфон", "samsung", "xiaomi", "galaxy", "android"]):
        return "smartphone"
    if any(k in text for k in ["ipad", "планшет", "tablet"]):
        return "tablet"
    if any(k in text for k in ["macbook", "ноутбук", "laptop", "notebook"]):
        return "laptop"
    if any(k in text for k in ["imac", "mac mini", "mac studio", "mac pro"]):
        return "desktop"
    if any(k in text for k in ["apple watch", "часы", "watch"]):
        return "smartwatch"
    if any(k in text for k in ["airpods", "наушник", "headphone"]):
        return "headphones"
    return ""


def _parse_product_node(item, category_url):
    if not isinstance(item, dict):
        return None
    name = str(item.get("name", "")).strip()
    if not name:
        return None
    url = normalize_image_url(item.get("url", ""))
    img_field = item.get("image", "")
    if isinstance(img_field, list):
        image = normalize_image_url(img_field[0]) if img_field else ""
    elif isinstance(img_field, dict):
        image = normalize_image_url(img_field.get("url", ""))
    else:
        image = normalize_image_url(img_field)
    price = 0
    old_price = 0
    offers = item.get("offers")
    if isinstance(offers, dict):
        price = clean_price(offers.get("price", 0) or offers.get("lowPrice", 0))
        old_price = clean_price(offers.get("highPrice", 0))
    elif isinstance(offers, list) and offers:
        prices = [clean_price(o.get("price", 0)) for o in offers if isinstance(o, dict)]
        prices = [p for p in prices if p > 0]
        if prices:
            price = min(prices)
            old_price = max(prices)
    brand_field = item.get("brand", "")
    brand = str(brand_field.get("name", "")).strip() if isinstance(brand_field, dict) else str(brand_field).strip()
    agg = item.get("aggregateRating", {})
    rating = to_float(agg.get("ratingValue", 0)) if isinstance(agg, dict) else 0
    review_count = to_int(agg.get("reviewCount", 0)) if isinstance(agg, dict) else 0
    if not price:
        return None
    return {
        "id": str(item.get("sku") or item.get("productID") or "").strip(),
        "name": name,
        "price": price,
        "old_price": old_price if old_price > price else price,
        "url": url,
        "image_url": image,
        "images": [image] if image else [],
        "brand": brand,
        "rating": rating,
        "review_count": review_count,
        "in_stock": True,
        "category": detect_category(category_url, name),
        "specs": [],
    }


def _parse_offer_node(item, category_url):
    if not isinstance(item, dict):
        return None
    name = str(item.get("name", "")).strip()
    if not name:
        return None
    url = normalize_image_url(item.get("url", ""))
    image = normalize_image_url(item.get("image", ""))
    price = clean_price(item.get("price", 0))
    if not price:
        return None
    avail = str(item.get("availability", ""))
    in_stock = "OutOfStock" not in avail
    return {
        "id": str(item.get("sku") or "").strip(),
        "name": name,
        "price": price,
        "old_price": price,
        "url": url,
        "image_url": image,
        "images": [image] if image else [],
        "brand": "",
        "rating": 0.0,
        "review_count": 0,
        "in_stock": in_stock,
        "category": detect_category(category_url, name),
        "specs": [],
    }


def extract_jsonld_products(page, category_url):
    try:
        raw_blocks = page.evaluate("""() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            return Array.from(scripts).map(s => s.textContent);
        }""")
    except Exception as exc:
        sys.stderr.write(f"pitergsm: jsonld evaluate error: {exc}\n")
        return []

    products = []
    seen_urls = set()

    for raw in (raw_blocks or []):
        try:
            block = json.loads(raw.strip())
        except Exception:
            continue

        # Format 1: mainEntity.itemListElement[].item
        main_entity = block.get("mainEntity")
        if isinstance(main_entity, dict):
            for entry in (main_entity.get("itemListElement") or []):
                item = entry.get("item") if isinstance(entry, dict) else None
                p = _parse_product_node(item, category_url)
                if p:
                    key = p["url"] or p["name"]
                    if key not in seen_urls:
                        seen_urls.add(key)
                        products.append(p)

        # Format 2: OfferCatalog.itemListElement[]
        if block.get("@type") == "OfferCatalog":
            for item in (block.get("itemListElement") or []):
                p = _parse_offer_node(item, category_url)
                if p:
                    key = p["url"] or p["name"]
                    if key not in seen_urls:
                        seen_urls.add(key)
                        products.append(p)

        # Format 3: ItemList at root
        if block.get("@type") == "ItemList":
            for entry in (block.get("itemListElement") or []):
                item = entry.get("item") if isinstance(entry, dict) else entry
                p = _parse_product_node(item, category_url)
                if p:
                    key = p["url"] or p["name"]
                    if key not in seen_urls:
                        seen_urls.add(key)
                        products.append(p)

    return products


def extract_dom_products(page, category_url):
    """Fallback DOM scraping."""
    try:
        items = page.evaluate("""() => {
            const results = [];
            const selectors = ['.digi-product', '[class*="digi-product"]', '.product', '.catalog-item'];
            let cards = [];
            for (const sel of selectors) {
                const found = document.querySelectorAll(sel);
                if (found.length > 1) { cards = Array.from(found); break; }
            }
            for (const card of cards) {
                const item = {};
                const nameEl = card.querySelector('[class*="title"] a, [class*="name"] a, h2 a, h3 a');
                item.name = nameEl ? nameEl.textContent.trim() : '';
                const linkEl = card.querySelector('a[href]');
                item.url = linkEl ? linkEl.getAttribute('href') : '';
                const priceEl = card.querySelector('[class*="price"]:not([class*="old"])');
                item.price_text = priceEl ? priceEl.textContent.trim() : '';
                const imgEl = card.querySelector('img[src], img[data-src]');
                item.image = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : '';
                item.id = card.getAttribute('data-id') || '';
                if (item.name || item.url) results.push(item);
            }
            return results;
        }""")
    except Exception as exc:
        sys.stderr.write(f"pitergsm: DOM error: {exc}\n")
        return []

    products = []
    for item in (items or []):
        name = str(item.get("name", "")).strip()
        raw_url = item.get("url", "")
        url = f"https://pitergsm.ru{raw_url}" if raw_url.startswith("/") else raw_url
        price = clean_price(item.get("price_text", ""))
        image = normalize_image_url(item.get("image", ""))
        if not name or not price:
            continue
        products.append({
            "id": str(item.get("id", "")).strip(),
            "name": name, "price": price, "old_price": price,
            "url": url, "image_url": image, "images": [image] if image else [],
            "brand": "", "rating": 0.0, "review_count": 0, "in_stock": True,
            "category": detect_category(category_url, name), "specs": [],
        })
    return products


def get_total_pages(page):
    """Get total number of pages from pagination."""
    try:
        total = page.evaluate("""() => {
            const pageLinks = document.querySelectorAll('.pagination__link, a[href*="PAGEN_2"]');
            let maxPage = 1;
            for (const link of pageLinks) {
                const num = parseInt(link.textContent.trim());
                if (!isNaN(num) && num > maxPage) maxPage = num;
                // Also check href
                const href = link.getAttribute('href') || '';
                const m = href.match(/PAGEN_2=(\d+)/);
                if (m) {
                    const n = parseInt(m[1]);
                    if (n > maxPage) maxPage = n;
                }
            }
            return maxPage;
        }""")
        return to_int(total, 1)
    except Exception:
        return 1


def click_show_more_and_wait(page):
    """Click 'Show more' button if present and wait for new items."""
    try:
        # Find button with text containing "Показать ещё" or "Показать еще"
        clicked = page.evaluate("""() => {
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text.includes('Показать ещё') || text.includes('Показать еще') || text.includes('Показать еш')) {
                    btn.click();
                    return true;
                }
            }
            return false;
        }""")
        if clicked:
            page.wait_for_timeout(2000)
            return True
    except Exception:
        pass
    return False


def parse_pitergsm(page, category_url):
    products = []
    seen = set()

    for page_num in range(1, 101):
        if page_num == 1:
            url = category_url
        else:
            sep = "&" if "?" in category_url else "?"
            url = f"{category_url}{sep}PAGEN_2={page_num}"

        sys.stderr.write(f"pitergsm: page {page_num}: {url}\n")

        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            if resp and resp.status >= 400:
                sys.stderr.write(f"pitergsm: HTTP {resp.status}, stopping\n")
                break
        except Exception as exc:
            sys.stderr.write(f"pitergsm: goto error: {exc}\n")
            break

        # Wait for products to load
        try:
            page.wait_for_selector(".digi-products, .digi-product, .catalog-item", timeout=10000)
        except Exception:
            pass
        time.sleep(1.5)

        # Get total pages on first page
        if page_num == 1:
            total_pages = get_total_pages(page)
            sys.stderr.write(f"pitergsm: total pages = {total_pages}\n")

        # Try JSON-LD first
        page_products = extract_jsonld_products(page, category_url)
        sys.stderr.write(f"pitergsm: JSON-LD={len(page_products)}\n")

        # Fallback to DOM
        if not page_products:
            page_products = extract_dom_products(page, category_url)
            sys.stderr.write(f"pitergsm: DOM={len(page_products)}\n")

        if not page_products:
            sys.stderr.write(f"pitergsm: no products on page {page_num}, stopping\n")
            break

        new_count = 0
        for p in page_products:
            key = p.get("url") or p.get("name")
            if key and key not in seen:
                seen.add(key)
                products.append(p)
                new_count += 1

        sys.stderr.write(f"pitergsm: page {page_num}/{total_pages} new={new_count} total={len(products)}\n")

        if new_count == 0:
            break
        if page_num >= total_pages:
            break

        time.sleep(0.5)

    return products


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: pitergsm.py <url>\n")
        print(json.dumps([]))
        sys.exit(1)

    url = sys.argv[1]
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="ru-RU",
            viewport={"width": 1920, "height": 1080},
        )
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        page = context.new_page()
        try:
            products = parse_pitergsm(page, url)
            print(json.dumps(products, ensure_ascii=False))
        except Exception as exc:
            sys.stderr.write(f"error: {exc}\n")
            print(json.dumps([]))
        finally:
            browser.close()


if __name__ == "__main__":
    main()
