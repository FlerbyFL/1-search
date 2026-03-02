#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright парсер для Ситилинк.
Использование: python browser.py <url>
Возвращает JSON в stdout.
"""
import sys, io, json, time, re
# Принудительно UTF-8 для stdout на Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

def clean_price(text):
    import re
    digits = re.sub(r'[^\d]', '', str(text))
    try:
        return int(digits)
    except:
        return 0

def detect_category(url, name):
    url = url.lower()
    name = name.lower()
    if 'noutbuki' in url or 'ноутбук' in name:
        return 'Ноутбуки'
    if 'smartfony' in url or 'смартфон' in name or 'телефон' in name:
        return 'Смартфоны'
    if 'televizory' in url or 'телевизор' in name:
        return 'Телевизоры'
    if 'planshety' in url or 'планшет' in name:
        return 'Планшеты'
    if 'processory' in url or 'процессор' in name:
        return 'Процессоры'
    if 'videokarty' in url or 'видеокарт' in name:
        return 'Видеокарты'
    return ''

def parse_citilink(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_selector("div.product-card-big, li.product-item", timeout=20000)
    except:
        pass
    time.sleep(3)

    content = page.content()
    products = []

    # Данные хранятся в Redux store в HTML
    marker = '"products":[{"id":"'
    idx = content.find(marker)
    if idx == -1:
        sys.stderr.write(f"marker not found in {len(content)} bytes\n")
        return products

    chunk = content[idx:]
    start = chunk.find('[')
    if start == -1:
        return products

    depth = 0
    end = -1
    for i in range(start, min(len(chunk), 300000)):
        if chunk[i] == '[':
            depth += 1
        elif chunk[i] == ']':
            depth -= 1
            if depth == 0:
                end = i
                break

    if end == -1:
        sys.stderr.write("products array end not found\n")
        return products

    try:
        items = json.loads(chunk[start:end+1])
    except Exception as e:
        sys.stderr.write(f"json parse error: {e}\n")
        return products

    def build_product_url(item_slug, item_id, raw_item_url):
        # Prefer URL from source payload when it exists.
        if isinstance(raw_item_url, str) and raw_item_url.strip():
            raw = raw_item_url.strip()
            if raw.startswith("http://") or raw.startswith("https://"):
                return raw
            if raw.startswith("/"):
                return f"https://www.citilink.ru{raw}"

        slug = str(item_slug or "").strip().strip("/")
        pid = str(item_id or "").strip()
        if slug and pid:
            # If slug ends with a numeric suffix that is not a real product code,
            # replace it with the actual product id instead of appending.
            suffix = re.search(r"-(\d+)$", slug)
            if suffix:
                if suffix.group(1) != pid:
                    slug = re.sub(r"-\d+$", f"-{pid}", slug)
            elif not slug.endswith(f"-{pid}"):
                slug = f"{slug}-{pid}"
        if slug:
            return f"https://www.citilink.ru/product/{slug}/"
        return ""

    for item in items:
        name = item.get("name", "")
        price_obj = item.get("price", {})
        price = price_obj.get("price", 0) if isinstance(price_obj, dict) else 0
        old_price = price_obj.get("old", 0) if isinstance(price_obj, dict) else 0
        slug = item.get("slug", "")
        pid = item.get("id", "")
        item_url = item.get("url", "") or item.get("link", "") or item.get("webUrl", "")
        brand = item.get("brand", {}).get("name", "") if isinstance(item.get("brand"), dict) else ""
        available = item.get("isAvailable", True)

        if not name or not price:
            continue

        products.append({
            "id": pid,
            "name": name,
            "price": price,
            "old_price": old_price if old_price else price,
            "url": build_product_url(slug, pid, item_url),
            "brand": brand,
            "in_stock": available,
            "category": detect_category(url, name),
        })

    return products

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: browser.py <url>\n")
        print(json.dumps([]))
        sys.exit(1)

    url = sys.argv[1]

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="ru-RU",
            viewport={"width": 1920, "height": 1080},
        )
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        page = context.new_page()

        try:
            products = parse_citilink(page, url)
            print(json.dumps(products, ensure_ascii=False))
        except Exception as e:
            sys.stderr.write(f"error: {e}\n")
            print(json.dumps([]))
        finally:
            browser.close()

if __name__ == "__main__":
    main()
