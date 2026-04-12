# -*- coding: utf-8 -*-
"""
Playwright parser for PiterGSM (pitergsm.ru).
Pagination: standard numbered pages + "Show more" button.
JSON-LD: mainEntity.itemListElement[].item (Product with offers)
"""

import io
import json
import os
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


def normalize_product_url(url):
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
    if url.startswith("catalog/"):
        return f"https://pitergsm.ru/{url}"
    return ""


def normalize_for_match(text):
    if not isinstance(text, str):
        text = str(text or "")
    return (
        text.lower()
        .replace("\u00a0", " ")
        .replace("\u202f", " ")
        .replace("\t", " ")
        .strip()
    )


def has_any(text, needles):
    for needle in needles:
        if needle in text:
            return True
    return False


def uniq_urls(urls, limit=6):
    seen = set()
    seen_keys = set()
    result = []
    for url in urls:
        normalized = normalize_image_url(url)
        if not normalized or normalized in seen:
            continue
        if normalized.lower().endswith(".svg"):
            continue
        key = normalized.split("?", 1)[0]
        if "/resize_cache/" in key:
            key = key.split("/")[-1]
        if key in seen_keys:
            continue
        seen.add(normalized)
        seen_keys.add(key)
        result.append(normalized)
        if len(result) >= limit:
            break
    return result


def clean_spec_name(name):
    if not isinstance(name, str):
        return ""
    name = re.sub(r"\s*[:：]\s*$", "", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def clean_spec_value(value):
    if not isinstance(value, str):
        return ""
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def dedupe_specs(specs, limit=20):
    if not isinstance(specs, list):
        return []
    seen = set()
    result = []
    for spec in specs:
        if not isinstance(spec, dict):
            continue
        name = clean_spec_name(spec.get("name", ""))
        value = clean_spec_value(spec.get("value", ""))
        if not name or not value:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append({"name": name, "value": value})
        if len(result) >= limit:
            break
    return result


def parse_stock_text(text):
    text = normalize_for_match(text)
    if not text:
        return None
    if has_any(text, ["нет в наличии", "отсутств", "под заказ", "ожидается", "предзаказ", "законч"]):
        return False
    if has_any(text, ["в наличии", "есть", "доступно", "готов к отгрузке"]):
        return True
    if has_any(text, ["out of stock", "sold out", "preorder"]):
        return False
    if has_any(text, ["in stock"]):
        return True
    return None


def parse_availability_value(value):
    text = normalize_for_match(value)
    if not text:
        return None
    compact = text.replace(" ", "").replace("-", "")
    if "outofstock" in compact or "soldout" in compact or "preorder" in compact:
        return False
    if "instock" in compact or "in stock" in text:
        return True
    return None


def detect_category(url, name):
    text = normalize_for_match(f"{url} {name}")
    if has_any(
        text,
        [
            "/accessories/",
            "accessories",
            "accessory",
            "aksessuar",
            "aksessuary",
            "chekhl",
            "chekh",
            "case",
            "cover",
            "zashchit",
            "glass",
            "kabel",
            "adapter",
            "charger",
            "power bank",
        ],
    ):
        return "accessories"
    if has_any(text, ["televizor", "televizory", "tv", "qled", "oled", "smart tv"]):
        return "tv"
    if has_any(text, ["iphone", "smartphone", "smartfon", "telefon", "samsung", "xiaomi", "galaxy", "android"]):
        return "smartphone"
    if has_any(text, ["ipad", "planshet", "tablet"]):
        return "tablet"
    if has_any(text, ["macbook", "noutbuk", "laptop", "notebook"]):
        return "laptop"
    if has_any(text, ["imac", "mac mini", "mac studio", "mac pro", "desktop", "monoblok"]):
        return "desktop"
    if has_any(text, ["apple watch", "smartwatch", "smart", "watch"]):
        return "smartwatch"
    if has_any(text, ["airpods", "naushnik", "headphone", "earbud"]):
        return "headphones"
    if has_any(text, ["playstation", "xbox", "nintendo", "switch", "pristavk", "konsol"]):
        return "console"
    return ""


def _parse_product_node(item, category_url):
    if not isinstance(item, dict):
        return None
    name = str(item.get("name", "")).strip()
    if not name:
        return None
    url = normalize_product_url(item.get("url", ""))
    img_field = item.get("image", "")
    images = []
    if isinstance(img_field, list):
        images = [normalize_image_url(i) for i in img_field if i]
    elif isinstance(img_field, dict):
        images = [normalize_image_url(img_field.get("url", ""))]
    else:
        images = [normalize_image_url(img_field)]
    images = uniq_urls(images, limit=6)
    image = images[0] if images else ""
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
    # Determine in_stock from offers availability
    in_stock = None
    if isinstance(offers, dict):
        in_stock = parse_availability_value(offers.get("availability", ""))
    elif isinstance(offers, list) and offers:
        parsed = [parse_availability_value(o.get("availability", "")) for o in offers if isinstance(o, dict)]
        parsed = [p for p in parsed if p is not None]
        if parsed:
            in_stock = any(parsed)
    stock_source = "jsonld" if in_stock is not None else ""
    return {
        "id": str(item.get("sku") or item.get("productID") or "").strip(),
        "name": name,
        "price": price,
        "old_price": old_price if old_price > price else price,
        "url": url,
        "image_url": image,
        "images": images,
        "brand": brand,
        "rating": rating,
        "review_count": review_count,
        "in_stock": in_stock,
        "category": detect_category(category_url, name),
        "specs": [],
        "_stock_source": stock_source,
    }


def _parse_offer_node(item, category_url):
    if not isinstance(item, dict):
        return None
    name = str(item.get("name", "")).strip()
    if not name:
        return None
    url = normalize_product_url(item.get("url", ""))
    images = [normalize_image_url(item.get("image", ""))]
    images = uniq_urls(images, limit=6)
    image = images[0] if images else ""
    price = clean_price(item.get("price", 0))
    if not price:
        return None
    in_stock = parse_availability_value(item.get("availability", ""))
    stock_source = "jsonld" if in_stock is not None else ""
    return {
        "id": str(item.get("sku") or "").strip(),
        "name": name,
        "price": price,
        "old_price": price,
        "url": url,
        "image_url": image,
        "images": images,
        "brand": "",
        "rating": 0.0,
        "review_count": 0,
        "in_stock": in_stock,
        "category": detect_category(category_url, name),
        "specs": [],
        "_stock_source": stock_source,
    }


def iter_jsonld_objects(node):
    if isinstance(node, list):
        for item in node:
            yield from iter_jsonld_objects(item)
        return
    if isinstance(node, dict):
        graph = node.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                yield from iter_jsonld_objects(item)
            return
        yield node


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

        for obj in iter_jsonld_objects(block):
            if not isinstance(obj, dict):
                continue

            # Format 1: mainEntity.itemListElement[].item
            main_entity = obj.get("mainEntity")
            if isinstance(main_entity, dict):
                for entry in (main_entity.get("itemListElement") or []):
                    item = entry.get("item") if isinstance(entry, dict) else None
                    p = _parse_product_node(item, category_url)
                    if p:
                        key = p.get("url") or p.get("name")
                        if key and key not in seen_urls:
                            seen_urls.add(key)
                            products.append(p)

            obj_type = obj.get("@type")

            # Format 2: OfferCatalog.itemListElement[]
            if obj_type == "OfferCatalog":
                for item in (obj.get("itemListElement") or []):
                    p = _parse_offer_node(item, category_url)
                    if p:
                        key = p.get("url") or p.get("name")
                        if key and key not in seen_urls:
                            seen_urls.add(key)
                            products.append(p)

            # Format 3: ItemList at root
            if obj_type == "ItemList" or (obj_type is None and isinstance(obj.get("itemListElement"), list)):
                for entry in (obj.get("itemListElement") or []):
                    item = entry.get("item") if isinstance(entry, dict) else entry
                    p = _parse_product_node(item, category_url)
                    if p:
                        key = p.get("url") or p.get("name")
                        if key and key not in seen_urls:
                            seen_urls.add(key)
                            products.append(p)

            # Format 4: Product at root (single product pages)
            if obj_type == "Product":
                p = _parse_product_node(obj, category_url)
                if p:
                    key = p.get("url") or p.get("name")
                    if key and key not in seen_urls:
                        seen_urls.add(key)
                        products.append(p)

    return products


def extract_dom_products(page, category_url):
    """Fallback DOM scraping."""
    try:
        items = page.evaluate("""() => {
            const results = [];
            const selectors = [
                '.prodcard',
                '.product-card',
                '.catalog-item',
                '.product',
                '[class*="product-card"]',
                '[class*="catalog-item"]',
            ];
            let cards = [];
            for (const sel of selectors) {
                const found = document.querySelectorAll(sel);
                if (found.length > 1) { cards = Array.from(found); break; }
            }
            if (!cards.length) {
                const seen = new Set();
                document.querySelectorAll('[data-product-id]').forEach(el => {
                    const card = el.closest('.prodcard') || el.closest('.product-card') || el.closest('.catalog-item') || el.closest('.product') || el.parentElement;
                    if (card && !seen.has(card)) {
                        seen.add(card);
                        cards.push(card);
                    }
                });
            }
            for (const card of cards) {
                const item = {};
                const nameEl = card.querySelector('.prodcard__name, .product__name, [class*="name"] a, h2 a, h3 a');
                item.name = nameEl ? nameEl.textContent.trim() : '';
                const linkEl = nameEl || card.querySelector('a[href]');
                item.url = linkEl ? linkEl.getAttribute('href') : '';
                const priceEl = card.querySelector('.prodcard__price, [class*="price"]:not([class*="old"])');
                item.price_text = priceEl ? priceEl.textContent.trim() : '';
                const oldPriceEl = card.querySelector('.prodcard__price-old, .prodcard__oldprice, [class*="old"][class*="price"]');
                item.old_price_text = oldPriceEl ? oldPriceEl.textContent.trim() : '';
                const statusEl = card.querySelector('.prodcard__status, [class*="status"], [class*="avail"]');
                item.status_text = statusEl ? statusEl.textContent.trim() : '';
                item.status_present = !!statusEl;
                const idEl = card.querySelector('[data-product-id], [data-productdatalayner-product-id], [data-id]');
                item.id = idEl ? (idEl.getAttribute('data-product-id') || idEl.getAttribute('data-productdatalayner-product-id') || idEl.getAttribute('data-id') || '') : '';

                item.specs = [];
                const specRows = card.querySelectorAll('.prodcard__moreinfo-row, [class*="spec"] [class*="row"]');
                specRows.forEach(row => {
                    const nameNode = row.querySelector('.prodcard__moreinfo-title, [class*="title"], [class*="name"]');
                    const valueNode = row.querySelector('.prodcard__moreinfo-val, [class*="val"], [class*="value"]');
                    const specName = nameNode ? nameNode.textContent.trim() : '';
                    const specValue = valueNode ? valueNode.textContent.trim() : '';
                    if (specName && specValue) item.specs.push({name: specName, value: specValue});
                });

                item.image_urls = [];
                const imgNodes = card.querySelectorAll('.prodcard__img-holder img, .prodcard__img-holder source, .prodcard__image-img, .prodcard__image source, img, source');
                imgNodes.forEach(el => {
                    const src = el.getAttribute('data-src') || el.getAttribute('data-lazy') || el.getAttribute('data-original') || el.getAttribute('src') || '';
                    if (src) item.image_urls.push(src);
                    const srcset = el.getAttribute('srcset');
                    if (srcset) {
                        srcset.split(',').forEach(part => {
                            const url = part.trim().split(' ')[0];
                            if (url) item.image_urls.push(url);
                        });
                    }
                });
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
        url = normalize_product_url(raw_url)
        price = clean_price(item.get("price_text", ""))
        old_price = clean_price(item.get("old_price_text", ""))
        if not price and old_price:
            price = old_price
        image_urls = uniq_urls(item.get("image_urls", []) or [], limit=6)
        image_url = image_urls[0] if image_urls else ""
        specs = dedupe_specs(item.get("specs", []) or [])
        in_stock = parse_stock_text(item.get("status_text", ""))
        status_present = bool(item.get("status_present"))
        stock_source = ""
        if in_stock is not None:
            stock_source = "dom"
        elif status_present:
            stock_source = "dom_unknown"
        if not name or not price:
            continue
        products.append({
            "id": str(item.get("id", "")).strip(),
            "name": name,
            "price": price,
            "old_price": old_price if old_price > price else price,
            "url": url,
            "image_url": image_url,
            "images": image_urls,
            "brand": "",
            "rating": 0.0,
            "review_count": 0,
            "in_stock": in_stock,
            "category": detect_category(category_url, name),
            "specs": specs,
            "_stock_source": stock_source,
            "_stock_dom_status": status_present,
        })
    return products


def merge_product(base, extra):
    if not isinstance(base, dict):
        return extra
    if not isinstance(extra, dict):
        return base

    if extra.get("name") and not base.get("name"):
        base["name"] = extra.get("name")

    if extra.get("url") and not base.get("url"):
        base["url"] = extra.get("url")

    base_price = to_int(base.get("price", 0), 0)
    extra_price = to_int(extra.get("price", 0), 0)
    if base_price <= 0 and extra_price > 0:
        base["price"] = extra_price

    base_old = to_int(base.get("old_price", 0), 0)
    extra_old = to_int(extra.get("old_price", 0), 0)
    if base_old <= 0 and extra_old > 0:
        base["old_price"] = extra_old

    def stock_rank(source):
        return {"dom": 3, "meta": 2, "jsonld": 1, "dom_unknown": 0}.get(source or "", 0)

    base_source = base.get("_stock_source", "")
    extra_source = extra.get("_stock_source", "")
    if extra.get("in_stock") is not None:
        if base.get("in_stock") is None or stock_rank(extra_source) >= stock_rank(base_source):
            base["in_stock"] = extra.get("in_stock")
            if extra_source:
                base["_stock_source"] = extra_source
    elif extra_source and not base_source:
        base["_stock_source"] = extra_source

    if extra.get("_stock_dom_status"):
        base["_stock_dom_status"] = True

    if extra.get("brand") and not base.get("brand"):
        base["brand"] = extra.get("brand")

    base_rating = to_float(base.get("rating", 0))
    extra_rating = to_float(extra.get("rating", 0))
    if extra_rating > base_rating:
        base["rating"] = extra_rating

    base_reviews = to_int(base.get("review_count", 0), 0)
    extra_reviews = to_int(extra.get("review_count", 0), 0)
    if extra_reviews > base_reviews:
        base["review_count"] = extra_reviews

    base_images = base.get("images") or []
    extra_images = extra.get("images") or []
    merged_images = uniq_urls(base_images + extra_images, limit=6)
    if merged_images:
        base["images"] = merged_images
        base["image_url"] = merged_images[0]

    base_specs = base.get("specs") or []
    extra_specs = extra.get("specs") or []
    merged_specs = dedupe_specs(base_specs + extra_specs)
    if merged_specs:
        base["specs"] = merged_specs

    if extra.get("category") and not base.get("category"):
        base["category"] = extra.get("category")

    return base


def merge_product_lists(primary, secondary):
    result = {}
    for item in (primary or []):
        key = item.get("url") or item.get("name")
        if not key:
            continue
        result[key] = item
    for item in (secondary or []):
        key = item.get("url") or item.get("name")
        if not key:
            continue
        if key in result:
            result[key] = merge_product(result[key], item)
        else:
            result[key] = item
    return list(result.values())


def finalize_product(item):
    if not isinstance(item, dict):
        return None
    price = to_int(item.get("price", 0), 0)
    old_price = to_int(item.get("old_price", 0), 0)
    if price <= 0 and old_price > 0:
        price = old_price
    if old_price <= 0:
        old_price = price
    if old_price < price:
        old_price = price
    item["price"] = price
    item["old_price"] = old_price

    if item.get("in_stock") is None:
        item["in_stock"] = price > 0

    images = uniq_urls(item.get("images") or [], limit=6)
    if not images and item.get("image_url"):
        images = uniq_urls([item.get("image_url")], limit=6)
    item["images"] = images
    if images:
        item["image_url"] = images[0]

    item["specs"] = dedupe_specs(item.get("specs") or [])
    if "_stock_source" in item:
        item.pop("_stock_source", None)
    if "_stock_dom_status" in item:
        item.pop("_stock_dom_status", None)
    return item


def extract_stock_from_html(html):
    if not html:
        return None

    patterns = [
        r'property=["\']product:availability["\'][^>]*content=["\']([^"\']+)',
        r'itemprop=["\']availability["\'][^>]*content=["\']([^"\']+)',
        r'property=["\']og:availability["\'][^>]*content=["\']([^"\']+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.I)
        if not match:
            continue
        value = match.group(1).strip()
        stock = parse_availability_value(value)
        if stock is None:
            stock = parse_stock_text(value)
        if stock is not None:
            return stock

    lowered = html.lower()
    if "product:availability" in lowered:
        if "out of stock" in lowered:
            return False
        if "in stock" in lowered:
            return True
    return None


def fetch_stock_from_product_page(page, product_url):
    if not product_url:
        return None
    try:
        resp = page.request.get(product_url, timeout=30000)
        if not resp or resp.status >= 400:
            return None
        html = resp.text()
        return extract_stock_from_html(html)
    except Exception as exc:
        sys.stderr.write(f"pitergsm: stock fetch error: {exc}\n")
        return None


def verify_stock_with_meta(page, products):
    limit_env = os.getenv("PITERGSM_STOCK_VERIFY_LIMIT", "")
    limit = None
    if limit_env:
        limit = to_int(limit_env, 0)
        if limit <= 0:
            return

    checked = 0
    for product in products:
        if limit is not None and checked >= limit:
            break
        if not isinstance(product, dict):
            continue
        source = product.get("_stock_source", "")
        dom_status = bool(product.get("_stock_dom_status"))
        in_stock = product.get("in_stock")
        if source in ("dom", "meta"):
            continue
        if in_stock is None or (source in ("jsonld", "") and not dom_status) or source == "dom_unknown":
            url = product.get("url", "")
            if not url:
                continue
            stock = fetch_stock_from_product_page(page, url)
            if stock is None:
                continue
            product["in_stock"] = stock
            product["_stock_source"] = "meta"
            checked += 1
            time.sleep(0.1)


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
                if (text.includes('Показать ещё') || text.includes('Показать еще') || text.includes('Показать все')) {
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
            page.wait_for_selector(".prodcard, .digi-products, .digi-product, .catalog-item", timeout=10000)
        except Exception:
            pass
        time.sleep(1.5)

        # Get total pages on first page
        if page_num == 1:
            total_pages = get_total_pages(page)
            sys.stderr.write(f"pitergsm: total pages = {total_pages}\n")
        
        # Collect JSON-LD and DOM products, then merge
        jsonld_products = extract_jsonld_products(page, category_url)
        dom_products = extract_dom_products(page, category_url)
        sys.stderr.write(f"pitergsm: JSON-LD={len(jsonld_products)} DOM={len(dom_products)}\n")

        page_products = merge_product_lists(jsonld_products, dom_products)
        verify_stock_with_meta(page, page_products)
        page_products = [p for p in (finalize_product(p) for p in page_products) if p]

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
