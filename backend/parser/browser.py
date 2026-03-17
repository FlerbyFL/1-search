# -*- coding: utf-8 -*-
"""
Playwright parser for Citilink.
Usage: python browser.py <url>
Outputs JSON to stdout.
"""

import copy
import io
import json
import os
import re
import sys
import time
from urllib.parse import quote

# Force UTF-8 for stdout/stderr on Windows
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


def normalize_image_url(value):
    if not isinstance(value, str):
        return ""
    url = value.strip()
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("/"):
        return f"https://www.citilink.ru{url}"
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return ""


def normalize_space_value(value):
    if not isinstance(value, str):
        return ""
    return value.strip()


def get_space_cookie_value(space_id):
    value = normalize_space_value(space_id)
    if not value:
        return ""
    return quote(value, safe="")


def set_citilink_space_cookie(context, space_id):
    value = get_space_cookie_value(space_id)
    if not value:
        return False
    try:
        context.add_cookies(
            [
                {
                    "name": "_space",
                    "value": value,
                    "domain": ".citilink.ru",
                    "path": "/",
                }
            ]
        )
        return True
    except Exception as exc:
        sys.stderr.write(f"failed to set citilink _space cookie: {exc}\n")
        return False


def uniq_urls(urls, limit=4):
    seen = set()
    seen_keys = set()
    result = []
    for url in urls:
        normalized = normalize_image_url(url)
        if not normalized or normalized in seen:
            continue
        key = normalized
        if "/plain/" in normalized:
            key = normalized.split("/plain/", 1)[1]
        elif "/product-images/" in normalized:
            key = normalized.split("/product-images/", 1)[1]
        if "?" in key:
            key = key.split("?", 1)[0]
        if key in seen_keys:
            continue
        seen.add(normalized)
        seen_keys.add(key)
        result.append(normalized)
        if len(result) >= limit:
            break
    return result


def extract_image_size(url):
    if not isinstance(url, str):
        return 0
    width = 0
    height = 0
    match = re.search(r"width:(\d+)", url)
    if match:
        width = to_int(match.group(1))
    match = re.search(r"height:(\d+)", url)
    if match:
        height = to_int(match.group(1))
    if width == 0:
        match = re.search(r"[?&]w(?:idth)?=(\d+)", url)
        if match:
            width = to_int(match.group(1))
    if height == 0:
        match = re.search(r"[?&]h(?:eight)?=(\d+)", url)
        if match:
            height = to_int(match.group(1))
    return max(width, height)


def normalize_for_match(text):
    if not isinstance(text, str):
        text = str(text or "")
    lowered = text.lower()
    # Handle common mojibake traces if they appear in upstream values.
    if "СЂ" in lowered:
        lowered = (
            lowered.replace("СЂС•", "Рѕ")
            .replace("СЂВµ", "Рµ")
            .replace("СЂВ°", "Р°")
            .replace("СЃ", "СЃ")
            .replace("С‘", "Рµ")
        )
    return lowered


def has_any(text, needles):
    for needle in needles:
        if needle in text:
            return True
    return False


def detect_category(url, name, category_name=""):
    url_text = normalize_for_match(url)
    name_text = normalize_for_match(name)
    cat_text = normalize_for_match(category_name)
    text = " ".join([url_text, name_text, cat_text])

    if has_any(text, ["televizory", "телевизор", "tv", "qled", "android tv", "smart tv"]):
        return "tv"
    if has_any(text, ["noutbuki", "ноутбук", "laptop", "notebook", "macbook"]):
        return "laptop"
    if has_any(text, ["smartfony", "смартфон", "телефон", "smartphone", "mobile phone", "iphone"]):
        return "smartphone"
    if has_any(text, ["planshet", "планшет", "tablet", "ipad", "galaxy tab"]):
        return "tablet"
    if has_any(text, ["processory", "процессор", " cpu ", "ryzen", "intel core"]):
        return "cpu"
    if has_any(text, ["videokarty", "видеокарт", "gpu", "rtx", "gtx", "radeon"]):
        return "gpu"
    if has_any(text, ["naushnik", "наушник", "headphone", "earbud", "airpods"]):
        return "headphones"
    if has_any(text, ["smartwatch", "смарт", "часы", "watch", "amazfit", "apple watch"]):
        return "smartwatch"
    if has_any(text, ["камера", "фотоаппарат", "camera", "canon", "nikon", "fujifilm"]):
        return "camera"
    return ""

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
        suffix = re.search(r"-(\d+)$", slug)
        if suffix:
            if suffix.group(1) != pid:
                slug = re.sub(r"-\d+$", f"-{pid}", slug)
        elif not slug.endswith(f"-{pid}"):
            slug = f"{slug}-{pid}"
    if slug:
        return f"https://www.citilink.ru/product/{slug}/"
    return ""


def extract_legacy_image_candidates(item):
    images = item.get("imagesList")
    if not isinstance(images, list):
        return []

    candidates = []
    preferred_keys = ("XL", "LARGE", "ML", "M", "MD", "VERTICAL", "HORIZONTAL", "SHORT", "SM", "XS")
    for image in images:
        if not isinstance(image, dict):
            continue
        url_value = image.get("url")
        if isinstance(url_value, str):
            candidates.append(url_value)
            continue
        if isinstance(url_value, dict):
            for key in preferred_keys:
                if key in url_value:
                    candidates.append(url_value.get(key))
            for value in url_value.values():
                candidates.append(value)
    return candidates


def extract_image_urls_legacy(item, limit=4):
    return uniq_urls(extract_legacy_image_candidates(item), limit=limit)


def sort_sources_by_quality(sources):
    if not isinstance(sources, list):
        return []
    rank = {
        "XL": 0,
        "LARGE": 1,
        "L": 2,
        "ML": 3,
        "M": 4,
        "MD": 5,
        "SM": 6,
        "S": 7,
        "XS": 8,
        "THUMB": 9,
    }

    prepared = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        url = normalize_image_url(source.get("url"))
        if not url:
            continue
        size = str(source.get("size", "")).upper()
        pixels = extract_image_size(url)
        prepared.append((pixels, rank.get(size, 100), url))

    prepared.sort(key=lambda x: (x[1], -x[0]))
    return [url for _, _, url in prepared]


def extract_image_urls_graphql(item, limit=4):
    images = item.get("images")
    if not isinstance(images, dict):
        return []

    gallery = images.get("citilink")
    if not isinstance(gallery, list):
        return []

    primary = []
    alternates = []
    for image in gallery:
        if not isinstance(image, dict):
            continue
        sorted_urls = sort_sources_by_quality(image.get("sources"))
        if not sorted_urls:
            continue
        primary.append(sorted_urls[0])
        if len(sorted_urls) > 1:
            alternates.extend(sorted_urls[1:])

    # Prefer different photos first, then fill with additional sizes if needed.
    combined = uniq_urls(primary, limit=limit)
    if len(combined) < min(2, limit):
        combined = uniq_urls(primary + alternates, limit=limit)
    elif len(combined) < limit:
        combined = uniq_urls(primary + alternates, limit=limit)
    return combined


def map_graphql_product(item, category_url):
    if not isinstance(item, dict):
        return None

    name = str(item.get("name", "")).strip()
    price_obj = item.get("price", {})
    if isinstance(price_obj, dict):
        price = clean_price(price_obj.get("current", 0))
        old_price = clean_price(price_obj.get("old", 0))
    else:
        price = 0
        old_price = 0
    if not name:
        return None

    item_id = str(item.get("id", "")).strip()
    product_url = build_product_url(item.get("slug", ""), item_id, item.get("url", ""))

    image_urls = extract_image_urls_graphql(item, limit=4)
    if not image_urls:
        image_urls = extract_image_urls_legacy(item, limit=4)
    image_url = image_urls[0] if image_urls else ""

    brand = ""
    brand_obj = item.get("brand")
    if isinstance(brand_obj, dict):
        brand = str(brand_obj.get("name", "")).strip()

    category_name = ""
    cat_obj = item.get("category")
    if isinstance(cat_obj, dict):
        category_name = str(cat_obj.get("name", "")).strip()
    category = detect_category(category_url, name, category_name)
    if not category:
        category = category_name

    specs = []
    properties_short = item.get("propertiesShort")
    if isinstance(properties_short, list):
        for prop in properties_short:
            if not isinstance(prop, dict):
                continue
            prop_name = str(prop.get("name", "")).strip()
            prop_value = str(prop.get("value", "")).strip()
            if not prop_name or not prop_value:
                continue
            specs.append({"name": prop_name, "value": prop_value})

    return {
        "id": item_id,
        "name": name,
        "price": price,
        "old_price": old_price if old_price else price,
        "url": product_url,
        "image_url": image_url,
        "images": image_urls,
        "brand": brand,
        "in_stock": bool(item.get("isAvailable", True)),
        "category": category,
        "specs": specs,
    }


def request_graphql_page(page, payload):
    for attempt in range(1, 9):
        try:
            result = page.evaluate(
                """async (payload) => {
                    return await new Promise((resolve) => {
                        try {
                            const xhr = new XMLHttpRequest();
                            xhr.open("POST", "https://www.citilink.ru/graphql/", true);
                            xhr.withCredentials = true;
                            xhr.setRequestHeader("content-type", "application/json");
                            xhr.timeout = 30000;
                            xhr.onreadystatechange = () => {
                                if (xhr.readyState === 4) {
                                    resolve({ status: xhr.status, text: xhr.responseText || "", error: "" });
                                }
                            };
                            xhr.onerror = () => resolve({ status: 0, text: "", error: "xhr error" });
                            xhr.ontimeout = () => resolve({ status: 0, text: "", error: "xhr timeout" });
                            xhr.send(JSON.stringify(payload));
                        } catch (error) {
                            resolve({ status: 0, text: "", error: String(error) });
                        }
                    });
                }""",
                payload,
            )
        except Exception as exc:
            sys.stderr.write(f"graphql evaluate failed (attempt {attempt}): {exc}\n")
            time.sleep(1.0 + attempt * 0.5)
            continue

        status = to_int(result.get("status", 0))
        body = result.get("text", "")
        if status == 200:
            try:
                return json.loads(body)
            except Exception as exc:
                sys.stderr.write(f"graphql json parse failed (attempt {attempt}): {exc}\n")
                err_text = result.get("error", "")
                if err_text:
                    sys.stderr.write(f"graphql read body error: {err_text}\n")
        else:
            sys.stderr.write(f"graphql status={status} (attempt {attempt})\n")
            err_text = result.get("error", "")
            if err_text:
                sys.stderr.write(f"graphql request error: {err_text}\n")

        if status == 429:
            # Citilink rate-limits burst GraphQL paging requests.
            # Exponential-like backoff keeps long scans stable.
            time.sleep(min(20.0, 1.5 * attempt * attempt))
        else:
            time.sleep(1.0 + attempt * 0.5)
    return None


def normalize_city_name(value):
    text = normalize_for_match(value)
    return text.replace("ё", "е").strip()


def fetch_citilink_cities_for_select(page):
    query = """
    query GetCitiesForSelect {
      citiesForSelect {
        mainCities { id name }
        groupedByLetter {
          letter
          cities { id name nameInDeclination spaceId isMainInRegion isUniqueName region }
        }
      }
    }
    """

    response = request_graphql_page(page, {"query": query, "variables": {}})
    if not response:
        return []
    data = response.get("data", {})
    cities_for_select = data.get("citiesForSelect", {})
    if not isinstance(cities_for_select, dict):
        return []

    cities = []
    seen = set()
    grouped = cities_for_select.get("groupedByLetter", [])
    if isinstance(grouped, list):
        for group in grouped:
            if not isinstance(group, dict):
                continue
            group_cities = group.get("cities", [])
            if not isinstance(group_cities, list):
                continue
            for city in group_cities:
                if not isinstance(city, dict):
                    continue
                cid = str(city.get("id", "")).strip()
                if not cid or cid in seen:
                    continue
                seen.add(cid)
                cities.append(city)

    main_cities = cities_for_select.get("mainCities", [])
    if isinstance(main_cities, list):
        for city in main_cities:
            if not isinstance(city, dict):
                continue
            cid = str(city.get("id", "")).strip()
            if not cid or cid in seen:
                continue
            seen.add(cid)
            cities.append(
                {
                    "id": cid,
                    "name": city.get("name", ""),
                    "spaceId": cid,
                    "isMainInRegion": True,
                    "isUniqueName": True,
                    "region": city.get("name", ""),
                }
            )

    return cities


def resolve_citilink_space_id(context):
    space_id = normalize_space_value(os.getenv("CITILINK_SPACE", ""))
    if space_id:
        if space_id.lower() in ("auto", "ip", "none"):
            return ""
        return space_id

    city_name = normalize_space_value(os.getenv("CITILINK_CITY", ""))
    if city_name:
        city_region = normalize_space_value(os.getenv("CITILINK_CITY_REGION", ""))
        page = context.new_page()
        try:
            page.goto("https://www.citilink.ru/", wait_until="domcontentloaded", timeout=60000)
            cities = fetch_citilink_cities_for_select(page)
        finally:
            page.close()

        target = normalize_city_name(city_name)
        region_target = normalize_city_name(city_region)
        candidates = []
        for city in cities:
            name = normalize_city_name(city.get("name", ""))
            if name == target:
                candidates.append(city)

        if region_target:
            region_filtered = []
            for city in candidates:
                region_name = normalize_city_name(city.get("region", ""))
                if region_target and region_target in region_name:
                    region_filtered.append(city)
            if region_filtered:
                candidates = region_filtered

        if candidates:
            candidates.sort(
                key=lambda c: (
                    0 if c.get("isMainInRegion") else 1,
                    0 if c.get("isUniqueName") else 1,
                    0 if c.get("spaceId") == c.get("id") else 1,
                )
            )
            picked = candidates[0]
            return str(picked.get("id", "")).strip()

    return "msk_cl"


def parse_citilink_via_graphql(page, category_url):
    captured_payload = {"value": None}

    def handle_request(request):
        if captured_payload["value"] is not None:
            return
        if "/graphql/" not in request.url:
            return
        post_data = request.post_data or ""
        if "GetSubcategoryProductsInitialFilter" not in post_data:
            return
        try:
            captured_payload["value"] = json.loads(post_data)
        except Exception as exc:
            sys.stderr.write(f"failed to capture graphql payload: {exc}\n")

    page.on("request", handle_request)
    page.goto(category_url, wait_until="domcontentloaded", timeout=60000)

    # Wait until app sends the initial GraphQL request.
    for _ in range(60):
        if captured_payload["value"] is not None:
            break
        page.wait_for_timeout(250)

    payload = captured_payload["value"]
    if not isinstance(payload, dict):
        sys.stderr.write("graphql payload not captured, fallback to html parser\n")
        return []

    filter_input = payload.get("variables", {}).get("subcategoryProductsFilterInput", {})
    if not isinstance(filter_input, dict):
        sys.stderr.write("invalid graphql filter payload, fallback to html parser\n")
        return []

    pagination = filter_input.get("pagination", {})
    per_page = 36
    if isinstance(pagination, dict):
        per_page = max(1, to_int(pagination.get("perPage", 36), 36))

    partial = filter_input.get("partialPagination", {})
    partial_limit = to_int(partial.get("limit", 0), 0) if isinstance(partial, dict) else 0
    partial_offset = to_int(partial.get("offset", 0), 0) if isinstance(partial, dict) else 0
    if partial_limit <= 0 or partial_offset < 0 or partial_offset >= per_page:
        partial_limit = per_page
        partial_offset = 0

    chunks = []
    if partial_offset > 0:
        chunks.append((0, partial_offset))
    if partial_limit > 0:
        chunks.append((partial_offset, min(partial_limit, per_page - partial_offset)))
    remaining = per_page - (partial_offset + partial_limit)
    if remaining > 0:
        chunks.append((partial_offset + partial_limit, remaining))
    if not chunks:
        chunks = [(0, per_page)]

    products = []
    seen = set()
    max_pages = 200
    total_pages = 0

    for page_num in range(1, max_pages + 1):
        page_new = 0
        page_items = 0
        has_next = False

        for chunk_idx, (offset, limit) in enumerate(chunks, start=1):
            page_payload = copy.deepcopy(payload)
            pf = page_payload.setdefault("variables", {}).setdefault("subcategoryProductsFilterInput", {})
            pg = pf.setdefault("pagination", {})
            pg["page"] = page_num
            pg["perPage"] = per_page
            pf["partialPagination"] = {"limit": limit, "offset": offset}

            response = request_graphql_page(page, page_payload)
            if not response:
                continue

            record = response.get("data", {}).get("productsFilter", {}).get("record", {})
            if not isinstance(record, dict):
                continue

            items = record.get("products", [])
            if not isinstance(items, list):
                continue

            new_count = 0
            for item in items:
                parsed = map_graphql_product(item, category_url)
                if not parsed:
                    continue
                key = parsed.get("id") or parsed.get("url") or parsed.get("name")
                if key in seen:
                    continue
                seen.add(key)
                products.append(parsed)
                new_count += 1

            page_items += len(items)
            page_new += new_count

            page_info = record.get("pageInfo", {})
            if isinstance(page_info, dict):
                if not total_pages:
                    total_pages = max(0, to_int(page_info.get("totalPages", 0), 0))
                has_next = has_next or bool(page_info.get("hasNextPage", False))

            sys.stderr.write(
                f"graphql page {page_num}/{total_pages or '?'} chunk {chunk_idx}/{len(chunks)}: items={len(items)} new={new_count} total={len(products)}\n"
            )

            time.sleep(0.35)

        if total_pages and page_num >= total_pages:
            break
        if not total_pages and not has_next:
            break
        if page_items == 0:
            break

        time.sleep(0.4)

    return products


def parse_citilink_fallback_html(page, category_url):
    try:
        page.wait_for_selector("div.product-card-big, li.product-item", timeout=15000)
    except Exception:
        pass
    time.sleep(2)

    content = page.content()
    products = []

    marker = '"products":[{"id":"'
    idx = content.find(marker)
    if idx == -1:
        sys.stderr.write(f"html marker not found in {len(content)} bytes\n")
        return products

    chunk = content[idx:]
    start = chunk.find("[")
    if start == -1:
        return products

    depth = 0
    end = -1
    for i in range(start, min(len(chunk), 400000)):
        if chunk[i] == "[":
            depth += 1
        elif chunk[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end == -1:
        sys.stderr.write("html products array end not found\n")
        return products

    try:
        items = json.loads(chunk[start : end + 1])
    except Exception as exc:
        sys.stderr.write(f"html json parse error: {exc}\n")
        return products

    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name", "")
        price_obj = item.get("price", {})
        price = price_obj.get("price", 0) if isinstance(price_obj, dict) else 0
        old_price = price_obj.get("old", 0) if isinstance(price_obj, dict) else 0
        slug = item.get("slug", "")
        pid = item.get("id", "")
        item_url = item.get("url", "") or item.get("link", "") or item.get("webUrl", "")
        image_urls = extract_image_urls_legacy(item, limit=4)
        image_url = image_urls[0] if image_urls else ""
        brand = item.get("brand", {}).get("name", "") if isinstance(item.get("brand"), dict) else ""
        available = item.get("isAvailable", True)

        if not name:
            continue

        normalized_price = clean_price(price)
        normalized_old_price = clean_price(old_price)
        products.append(
            {
                "id": str(pid),
                "name": name,
                "price": normalized_price,
                "old_price": normalized_old_price if normalized_old_price else normalized_price,
                "url": build_product_url(slug, pid, item_url),
                "image_url": image_url,
                "images": image_urls,
                "brand": brand,
                "in_stock": available,
                "category": detect_category(category_url, name),
                "specs": [],
            }
        )

    return products


def parse_citilink(page, category_url):
    products = parse_citilink_via_graphql(page, category_url)
    if products:
        return products
    return parse_citilink_fallback_html(page, category_url)


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
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="ru-RU",
            viewport={"width": 1920, "height": 1080},
        )
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        space_id = resolve_citilink_space_id(context)
        if space_id:
            set_citilink_space_cookie(context, space_id)
        page = context.new_page()

        try:
            products = parse_citilink(page, url)
            print(json.dumps(products, ensure_ascii=False))
        except Exception as exc:
            sys.stderr.write(f"error: {exc}\n")
            print(json.dumps([]))
        finally:
            browser.close()


if __name__ == "__main__":
    main()
