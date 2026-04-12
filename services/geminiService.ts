import { GoogleGenAI } from "@google/genai";
import { Product } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");
const LOCAL_FALLBACK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#F1F5F9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748B" font-family="Arial" font-size="40">Нет фото</text></svg>'
)}`;

// Helper to generate a random ID
const generateId = () => Math.random().toString(36).slice(2, 11);

type BackendProduct = {
  ID?: number;
  ExternalID?: string;
  Name?: string;
  Price?: number | string;
  OldPrice?: number | string;
  Currency?: string;
  Shop?: string;
  URL?: string;
  Category?: string;
  Brand?: string;
  Rating?: number | string;
  ReviewCount?: number;
  InStock?: boolean;
  Specs?: Record<string, unknown> | Array<{ name?: string; value?: unknown }>;
  ImageURL?: string;
  ImageURLs?: string[];
  image_url?: string;
  image_urls?: string[];
  images?: string[];
  name?: string;
  price?: number | string;
  old_price?: number | string;
  shop_name?: string;
  shop?: string;
  url?: string;
  available?: boolean;
  specs?: Record<string, unknown> | Array<{ name?: string; value?: unknown }>;
  category?: string;
  brand?: string;
  rating?: number | string;
  review_count?: number;
};

type BackendSearchResponse = {
  data?: BackendProduct[];
  results?: BackendProduct[];
};

type BackendProductsResponse = {
  data?: BackendProduct[];
  total?: number;
  page?: number;
  limit?: number;
};

type CategoryIntent = {
  category: Product["category"];
  backendCategoryQuery: string;
};

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const readNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const readBoolean = (value: unknown, fallback = true): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const normalizeShopName = (value: string): string => {
  const trimmed = readString(value);
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.includes("pitergsm") || lower.includes("piter gsm")) return "PiterGSM";
  if (lower.includes("citilink") || lower.includes("citylink") || lower.includes("ситилинк")) return "Citilink";
  if (lower.includes("m.video") || lower.includes("mvideo")) return "M.Video";
  if (lower.includes("yandex")) return "Yandex Market";
  if (lower.includes("wildberries")) return "Wildberries";
  if (lower.includes("ozon")) return "Ozon";
  if (lower.includes("dns")) return "DNS";
  return trimmed;
};

const normalizeSpecs = (
  raw: BackendProduct["Specs"] | BackendProduct["specs"]
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!raw) return result;

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      const name = readString(item?.name);
      const value = readString(item?.value);
      if (!name || !value) return;
      result[name] = value;
    });
    return result;
  }

  Object.entries(raw).forEach(([key, value]) => {
    const label = readString(key);
    const textValue = readString(value);
    if (!label || !textValue) return;
    result[label] = textValue;
  });
  return result;
};

const extractSpecsFromName = (name: string): Record<string, string> => {
  const specs: Record<string, string> = {};
  const safeName = readString(name);
  if (!safeName) return specs;

  const displayMatch = safeName.match(/(\d+(?:[.,]\d+)?)\s*(?:["\u2033\u201d]|\u0434\u044e\u0439\u043c)/i);
  if (displayMatch) {
    specs["\u042d\u043a\u0440\u0430\u043d"] = `${displayMatch[1].replace(",", ".")}"`;
  }

  const memoryMatch = safeName.match(/(\d+)\s*\/\s*(\d+)\s*(?:gb|\u0433\u0431)/i);
  if (memoryMatch) {
    specs["\u041f\u0430\u043c\u044f\u0442\u044c"] = `\u043e\u043f\u0435\u0440\u0430\u0442\u0438\u0432\u043d\u0430\u044f ${memoryMatch[1]} \u0413\u0411, \u0432\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u0430\u044f ${memoryMatch[2]} \u0413\u0411`;
  }

  const refreshRateMatch = safeName.match(/(\d+)\s*(?:\u0433\u0446|hz)/i);
  if (refreshRateMatch) {
    specs["\u0427\u0430\u0441\u0442\u043e\u0442\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f"] = `${refreshRateMatch[1]} \u0413\u0446`;
  }

  const cameraMatch = safeName.match(/(\d+)\s*(?:\u043c\u043f|mp)/i);
  if (cameraMatch) {
    specs["\u041a\u0430\u043c\u0435\u0440\u0430"] = `${cameraMatch[1]} \u041c\u043f`;
  }

  const batteryMatch = safeName.match(/(\d{4,5})\s*(?:\u043c\u0430\u0447|mah)/i);
  if (batteryMatch) {
    specs["\u0410\u043a\u043a\u0443\u043c\u0443\u043b\u044f\u0442\u043e\u0440"] = `${batteryMatch[1]} \u043c\u0410\u0447`;
  }

  const ipMatch = safeName.match(/\b(IP\d{2})\b/i);
  if (ipMatch) {
    specs["\u0417\u0430\u0449\u0438\u0442\u0430"] = ipMatch[1].toUpperCase();
  }

  if (/\bnfc\b/i.test(safeName)) {
    specs["NFC"] = "\u0414\u0430";
  }

  const chipsetMatch = safeName.match(
    /\b(?:snapdragon|dimensity|helio|unisoc|exynos|kirin|ryzen|intel core|apple m\d)\b[^,)]*/i
  );
  if (chipsetMatch) {
    specs["\u041f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440"] = chipsetMatch[0].trim();
  }

  if (Object.keys(specs).length === 0) {
    specs["\u041c\u043e\u0434\u0435\u043b\u044c"] = safeName;
  }

  return specs;
};

const normalizeImageUrl = (value: string, shop?: string): string => {
  let normalized = readString(value);
  if (!normalized) return "";

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }
  if (normalized.startsWith("/")) {
    const shopLower = readString(shop).toLowerCase();
    if (shopLower.includes("pitergsm")) {
      normalized = `https://pitergsm.ru${normalized}`;
    } else if (shopLower.includes("citilink") || shopLower.includes("citylink") || shopLower.includes("ситилинк")) {
      normalized = `https://www.citilink.ru${normalized}`;
    }
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "citilink.ru" || parsed.hostname.endsWith(".citilink.ru")) {
      return `${API_BASE}/api/v1/images/proxy?url=${encodeURIComponent(parsed.toString())}`;
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeImageCollection = (shop: string, ...values: unknown[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushValue = (candidate: unknown) => {
    const normalized = normalizeImageUrl(readString(candidate), shop);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }
    pushValue(value);
  });

  return result.slice(0, 4);
};

const extractCitilinkCode = (externalID: string): string => {
  const safeExternalId = readString(externalID);
  const match = safeExternalId.match(/(\d{5,})/);
  return match ? match[1] : "";
};

const fixCitilinkProductUrl = (url: string, externalID: string): string => {
  const safeUrl = readString(url);
  if (!safeUrl) return safeUrl;

  const productCode = extractCitilinkCode(externalID);
  if (!productCode) return safeUrl;

  try {
    const parsed = new URL(safeUrl);
    if (!parsed.hostname.includes("citilink.ru")) return safeUrl;
    if (!parsed.pathname.startsWith("/product/")) return safeUrl;

    let pathname = parsed.pathname.replace(/\/+$/, "");
    const suffixMatch = pathname.match(/-(\d+)$/);
    if (suffixMatch) {
      if (suffixMatch[1] === productCode) return safeUrl;
      pathname = pathname.replace(/-\d+$/, `-${productCode}`);
    } else {
      pathname = `${pathname}-${productCode}`;
    }

    pathname = `${pathname}/`;
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return safeUrl;
  }
};

const normalizeBackendProduct = (raw: BackendProduct, fallbackName: string) => {
  const name = readString(raw.Name) || readString(raw.name) || fallbackName;
  const price = readNumber(raw.Price ?? raw.price);
  const oldPrice = readNumber(raw.OldPrice ?? raw.old_price);
  const shopRaw = readString(raw.Shop) || readString(raw.shop_name) || readString(raw.shop);
  const shopName = normalizeShopName(shopRaw);
  const backendId = typeof raw.ID === "number" && Number.isFinite(raw.ID) ? raw.ID : undefined;
  const externalId = readString(raw.ExternalID);
  const url = fixCitilinkProductUrl(readString(raw.URL) || readString(raw.url), externalId);
  const images = normalizeImageCollection(shopRaw || shopName, raw.ImageURLs, raw.image_urls, raw.images, raw.ImageURL, raw.image_url);
  const image = images[0] || "";
  const available = readBoolean(raw.InStock ?? raw.available, false);
  const brand = readString(raw.Brand) || readString(raw.brand);
  const category = readString(raw.Category) || readString(raw.category);
  const rating = readNumber(raw.Rating ?? raw.rating);
  const reviewCount = typeof raw.ReviewCount === "number" ? raw.ReviewCount : raw.review_count ?? 0;
  const parsedSpecs = normalizeSpecs(raw.Specs ?? raw.specs);
  const fallbackSpecs = extractSpecsFromName(name);
  const specs = { ...fallbackSpecs, ...parsedSpecs };

  return {
    name,
    price,
    oldPrice,
    shopName,
    url,
    image,
    images,
    available,
    brand,
    category,
    rating,
    reviewCount,
    backendId,
    externalId,
    specs,
  };
};

const normalizeNameForGroup = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

const ACCESSORY_PATTERNS = /чехол|накладка|case\b|cover\b|стекло|защитное стекло|screen protector|зарядк[аы]|charger|кабель|cable|usb[- ]?c|lightning|magSafe|держатель|holder|подставк|ремешок|strap|band|сумк|кошелек|wallet|powerbank|power bank|адаптер|adapter|переходник|hub|концентратор|бампер|пленк|stylus|стилус|очистител|cleaning|набор\s*аксессуар/i;

const inferCategory = (name: string): Product["category"] => {
  const text = name.toLowerCase();

  if (ACCESSORY_PATTERNS.test(text)) return "accessories";
  if (/наушник|headphone|earbud|airpods|sony wh|buds/i.test(text)) return "headphones";
  if (/телевизор|tv|qled|android tv|smart tv/i.test(text)) return "tv";
  if (/смартфон|телефон|iphone|smartphone|mobile phone/i.test(text)) return "smartphone";
  if (/ноутбук|laptop|macbook|rog|legion|ideapad|vivobook|zenbook|aspire|pavilion|notebook/i.test(text)) return "laptop";
  if (/видеокарт|rtx|gtx|radeon|gpu|videocard/i.test(text)) return "gpu";
  if (/процессор|cpu|ryzen|intel core/i.test(text)) return "cpu";
  if (/часы|smartwatch|watch|apple watch|galaxy watch|amazfit/i.test(text)) return "smartwatch";
  if (/камера|фотоаппарат|camera|photo|canon|nikon|sony a7|fujifilm/i.test(text)) return "camera";
  if (/планшет|tablet|ipad|galaxy tab|xiaomi pad/i.test(text)) return "tablet";

  return "smartphone";
};

const normalizeBackendCategory = (rawCategory: string, name: string): Product["category"] => {
  const nameValue = name.toLowerCase();

  // Имя товара имеет ПРИОРИТЕТ над категорией бэкенда
  if (ACCESSORY_PATTERNS.test(nameValue)) return "accessories";
  if (/наушник|headphone|earbud|airpods|sony wh|buds/i.test(nameValue)) return "headphones";
  if (/телевизор|tv|qled|android tv|smart tv/i.test(nameValue)) return "tv";
  if (/смартфон|телефон|iphone|smartphone|mobile phone/i.test(nameValue)) return "smartphone";
  if (/ноутбук|laptop|macbook|rog|legion|ideapad|vivobook|zenbook|aspire|pavilion|notebook/i.test(nameValue)) return "laptop";
  if (/видеокарт|rtx|gtx|radeon|gpu|videocard/i.test(nameValue)) return "gpu";
  if (/процессор|cpu|ryzen|intel core/i.test(nameValue)) return "cpu";
  if (/часы|smartwatch|watch|apple watch|galaxy watch|amazfit/i.test(nameValue)) return "smartwatch";
  if (/камера|фотоаппарат|camera|photo|canon|nikon|sony a7|fujifilm/i.test(nameValue)) return "camera";
  if (/планшет|tablet|ipad|galaxy tab|xiaomi pad/i.test(nameValue)) return "tablet";

  const value = rawCategory.trim().toLowerCase();
  switch (value) {
    case "smartphone":
      return "smartphone";
    case "laptop":
      return "laptop";
    case "tablet":
      return "tablet";
    case "headphones":
      return "headphones";
    case "smartwatch":
      return "smartwatch";
    case "camera":
      return "camera";
    case "gpu":
      return "gpu";
    case "cpu":
      return "cpu";
    case "tv":
      return "tv";
    case "accessories":
      return "accessories";
    default:
      return inferCategory(name);
  }
};

const normalizeCategoryQuery = (query: string): string =>
  query
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isCategoryQuery = (normalized: string, terms: string[]): boolean => {
  if (!normalized) return false;
  if (terms.includes(normalized)) return true;

  if (normalized.startsWith("\u0432\u0441\u0435 ")) {
    const rest = normalized.slice(4).trim();
    if (terms.includes(rest)) return true;
  }
  if (normalized.endsWith(" \u0432\u0441\u0435")) {
    const rest = normalized.slice(0, -4).trim();
    if (terms.includes(rest)) return true;
  }

  return false;
};

const detectCategoryIntent = (query: string): CategoryIntent | null => {
  const normalized = normalizeCategoryQuery(query);
  if (!normalized) return null;

  if (
    isCategoryQuery(normalized, [
      "\u0441\u043c\u0430\u0440\u0442\u0444\u043e\u043d",
      "\u0441\u043c\u0430\u0440\u0442\u0444\u043e\u043d\u044b",
      "\u0442\u0435\u043b\u0435\u0444\u043e\u043d",
      "\u0442\u0435\u043b\u0435\u0444\u043e\u043d\u044b",
      "\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u0442\u0435\u043b\u0435\u0444\u043e\u043d",
      "\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u044b",
      "\u043c\u043e\u0431\u0438\u043b\u044c\u043d\u0438\u043a",
      "\u043c\u043e\u0431\u0438\u043b\u043a\u0430",
      "phone",
      "phones",
      "mobile phone",
      "mobile phones",
      "smartphone",
      "smartphones",
    ])
  ) {
    return { category: "smartphone", backendCategoryQuery: "smartphone" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u043d\u043e\u0443\u0442\u0431\u0443\u043a",
      "\u043d\u043e\u0443\u0442\u0431\u0443\u043a\u0438",
      "\u043b\u044d\u043f\u0442\u043e\u043f",
      "laptop",
      "laptops",
      "notebook",
      "notebooks",
    ])
  ) {
    return { category: "laptop", backendCategoryQuery: "laptop" };
  }
  if (isCategoryQuery(normalized, ["\u0442\u0435\u043b\u0435\u0432\u0438\u0437\u043e\u0440", "\u0442\u0435\u043b\u0435\u0432\u0438\u0437\u043e\u0440\u044b", "tv", "tvs", "smart tv", "android tv"])) {
    return { category: "tv", backendCategoryQuery: "tv" };
  }
  if (isCategoryQuery(normalized, ["\u043f\u043b\u0430\u043d\u0448\u0435\u0442", "\u043f\u043b\u0430\u043d\u0448\u0435\u0442\u044b", "tablet", "tablets", "ipad", "ipads"])) {
    return { category: "tablet", backendCategoryQuery: "tablet" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u043d\u0430\u0443\u0448\u043d\u0438\u043a",
      "\u043d\u0430\u0443\u0448\u043d\u0438\u043a\u0438",
      "headphone",
      "headphones",
      "earbud",
      "earbuds",
      "airpods",
    ])
  ) {
    return { category: "headphones", backendCategoryQuery: "headphones" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u0430",
      "\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u044b",
      "gpu",
      "graphics card",
      "graphics cards",
      "videocard",
      "video card",
    ])
  ) {
    return { category: "gpu", backendCategoryQuery: "gpu" };
  }
  if (isCategoryQuery(normalized, ["\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440", "\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440\u044b", "cpu", "processor", "processors"])) {
    return { category: "cpu", backendCategoryQuery: "cpu" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u0447\u0430\u0441\u044b",
      "\u0441\u043c\u0430\u0440\u0442 \u0447\u0430\u0441\u044b",
      "\u0441\u043c\u0430\u0440\u0442-\u0447\u0430\u0441\u044b",
      "smartwatch",
      "smartwatches",
      "watch",
      "watches",
    ])
  ) {
    return { category: "smartwatch", backendCategoryQuery: "smartwatch" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u043a\u0430\u043c\u0435\u0440\u0430",
      "\u043a\u0430\u043c\u0435\u0440\u044b",
      "\u0444\u043e\u0442\u043e\u0430\u043f\u043f\u0430\u0440\u0430\u0442",
      "\u0444\u043e\u0442\u043e\u0430\u043f\u043f\u0430\u0440\u0430\u0442\u044b",
      "camera",
      "cameras",
    ])
  ) {
    return { category: "camera", backendCategoryQuery: "camera" };
  }
  if (
    isCategoryQuery(normalized, [
      "\u0430\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440",
      "\u0430\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b",
      "\u0447\u0435\u0445\u043e\u043b",
      "\u0447\u0435\u0445\u043b\u044b",
      "\u0441\u0442\u0435\u043a\u043b\u043e",
      "\u0437\u0430\u0449\u0438\u0442\u043d\u043e\u0435 \u0441\u0442\u0435\u043a\u043b\u043e",
      "\u0437\u0430\u0440\u044f\u0434\u043a\u0430",
      "\u0437\u0430\u0440\u044f\u0434\u043d\u043e\u0435 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e",
      "\u043a\u0430\u0431\u0435\u043b\u044c",
      "\u043a\u0430\u0431\u0435\u043b\u0438",
      "\u043d\u0430\u0443\u0448\u043d\u0438\u043a\u0438 \u0430\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440",
      "accessories",
      "accessory",
      "case",
      "cases",
      "charger",
      "cable",
    ])
  ) {
    return { category: "accessories", backendCategoryQuery: "accessories" };
  }

  return null;
};

const mapLogo = (shop: string): string => {
  const value = shop.toLowerCase();
  if (value.includes("pitergsm")) return "pitergsm";
  if (value.includes("ozon")) return "ozon";
  if (value.includes("wildberries")) return "wb";
  if (value.includes("dns")) return "dns";
  if (value.includes("yandex")) return "yandex";
  if (value.includes("m.video") || value.includes("mvideo")) return "mvideo";
  if (value.includes("citilink") || value.includes("citylink")) return "citilink";
  return "shop";
};

const getFallbackImage = (name: string, query: string): string => {
  void name;
  void query;
  return LOCAL_FALLBACK_IMAGE;
};

const toSpecKey = (label: string): string =>
  label
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");

const toUiSpecs = (source: Record<string, string>): Product["specs"] => {
  const entries = Object.entries(source);
  const specs: Product["specs"] = {};
  entries.forEach(([label, value], index) => {
    const key = toSpecKey(label) || `spec_${index + 1}`;
    specs[key] = {
      label,
      value,
      important: index < 8,
    };
  });
  return specs;
};

// Backend (Go scraper) -> UI hydration
const hydrateBackendProducts = (rawResults: BackendProduct[], query: string): Product[] => {
  if (!Array.isArray(rawResults) || rawResults.length === 0) return [];

  type BackendOffer = {
    id: string;
    name: string;
    price: number;
    oldPrice?: number;
    delivery: string;
    rating: number;
    logo: string;
    url: string;
    backendId?: number;
    externalId?: string;
  };

  type BackendGroup = {
    id: string;
    name: string;
    category: Product["category"];
    images: string[];
    rating: number;
    reviewCount: number;
    brand: string;
    inStock: boolean;
    specs: Record<string, string>;
    oldPrice: number;
    offers: BackendOffer[];
  };

  const groups = new Map<string, BackendGroup>();

  const mergeImages = (current: string[], incoming: string[]): string[] => {
    const merged = [...current];
    incoming.forEach((image) => {
      if (!image || merged.includes(image)) return;
      merged.push(image);
    });
    return merged.slice(0, 4);
  };

  for (const raw of rawResults) {
    const normalized = normalizeBackendProduct(raw, query);
    if (!normalized.name || !normalized.price || !normalized.shopName || !normalized.url) continue;

    const groupKey = normalizeNameForGroup(normalized.name);
    let group = groups.get(groupKey);

    if (!group) {
      const normalizedCategory = normalizeBackendCategory(normalized.category, normalized.name);
      const fallbackImage = getFallbackImage(normalized.name, query);
      const images = normalized.images.length > 0 ? normalized.images : [normalized.image || fallbackImage];
      group = {
        id: generateId(),
        name: normalized.name,
        category: normalizedCategory,
        images,
        rating: normalized.rating || 4.6,
        reviewCount: normalized.reviewCount || 0,
        brand: normalized.brand,
        inStock: normalized.available,
        specs: normalized.specs,
        oldPrice: normalized.oldPrice,
        offers: [],
      };
      groups.set(groupKey, group);
    }

    if (!group.brand && normalized.brand) {
      group.brand = normalized.brand;
    }
    if (normalized.images.length > 0) {
      group.images = mergeImages(group.images, normalized.images);
    }
    if (Object.keys(normalized.specs).length > Object.keys(group.specs).length) {
      group.specs = normalized.specs;
    }
    if (normalized.oldPrice > group.oldPrice) {
      group.oldPrice = normalized.oldPrice;
    }
    if (!normalized.available) {
      group.inStock = false;
    }

    group.offers.push({
      id: `${group.id}-${group.offers.length + 1}`,
      name: normalized.shopName,
      price: Math.round(normalized.price),
      oldPrice: normalized.oldPrice > normalized.price ? Math.round(normalized.oldPrice) : undefined,
      delivery: "Сегодня",
      rating: normalized.rating || 4.5,
      logo: mapLogo(normalized.shopName),
      url: normalized.url,
      backendId: normalized.backendId,
      externalId: normalized.externalId,
    });
  }

  const products: Product[] = [];

  for (const group of groups.values()) {
    if (!group.offers.length) continue;

    group.offers.sort((a, b) => a.price - b.price);
    const bestOffer = group.offers[0];
    const gallery = group.images.length > 0 ? group.images : [getFallbackImage(group.name, query)];

    products.push({
      id: group.id,
      backendId: bestOffer.backendId,
      externalId: bestOffer.externalId,
      name: group.name,
      category: group.category,
      image: gallery[0],
      images: gallery,
      price: bestOffer.price,
      oldPrice: bestOffer.oldPrice || (group.oldPrice > bestOffer.price ? group.oldPrice : undefined),
      rating: group.rating,
      reviewCount: group.reviewCount,
      reviews: [],
      specs: toUiSpecs(group.specs),
      tags: [group.brand].filter(Boolean),
      description: group.name,
      priceHistory: [
        { date: "Ранее", price: bestOffer.price, shopName: bestOffer.name },
        { date: "Сегодня", price: bestOffer.price, shopName: bestOffer.name },
      ],
      offers: group.offers,
      brand: group.brand || undefined,
      inStock: group.inStock,
    });
  }

  return products.sort((a, b) => a.price - b.price);
};

// Backend search helpers (multi-query for families like iPhone 15)
const buildBackendQueries = (query: string): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (/iphone\s*15\b/i.test(trimmed) && !/(pro|plus|max)/i.test(trimmed)) {
    return ["iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max"];
  }

  return [trimmed];
};

const extractBackendResults = (
  response: BackendSearchResponse | BackendProductsResponse
): BackendProduct[] => {
  if (Array.isArray(response.data)) return response.data;
  if ("results" in response && Array.isArray(response.results)) return response.results;
  return [];
};

const uniqueBackendResults = (items: BackendProduct[]): BackendProduct[] => {
  const unique = new Map<string, BackendProduct>();

  for (const item of items) {
    const keyParts = [
      readString(item.ExternalID),
      readString(item.Name) || readString(item.name),
      readString(item.Shop) || readString(item.shop_name) || readString(item.shop),
      readString(item.URL) || readString(item.url),
      String(readNumber(item.Price ?? item.price)),
    ];
    const key = keyParts.join("|").toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()];
};

const fetchBackendResults = async (queries: string[]): Promise<BackendProduct[]> => {
  const all: BackendProduct[] = [];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(
          `${API_BASE}/api/v1/products/search?q=${encodeURIComponent(q)}&limit=100`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const payload: BackendSearchResponse = await response.json();
        all.push(...extractBackendResults(payload));
      } catch {
        // Ignore partial failures and continue with other requests.
      }
    })
  );

  return uniqueBackendResults(all);
};

const fetchCategoryProducts = async (categoryQuery: string): Promise<BackendProduct[]> => {
  const all: BackendProduct[] = [];
  const limit = 100;
  const maxPages = 200;
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  try {
    while (page <= maxPages && all.length < total) {
      const response = await fetch(
        `${API_BASE}/api/v1/products?category=${encodeURIComponent(categoryQuery)}&page=${page}&limit=${limit}`
      );
      if (!response.ok) break;

      const payload: BackendProductsResponse = await response.json();
      const batch = extractBackendResults(payload);
      if (batch.length === 0) break;

      all.push(...batch);

      if (typeof payload.total === "number" && Number.isFinite(payload.total)) {
        total = payload.total;
      }
      const payloadLimit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : limit;
      if (Number.isFinite(total)) {
        const totalPages = Math.ceil(total / payloadLimit);
        if (page >= totalPages) break;
      }

      page += 1;
    }
  } catch {
    return uniqueBackendResults(all);
  }

  return uniqueBackendResults(all);
};

export const searchProductsWithAI = async (query: string): Promise<Product[]> => {
  try {
    const categoryIntent = detectCategoryIntent(query);
    if (categoryIntent) {
      const categoryResults = await fetchCategoryProducts(categoryIntent.backendCategoryQuery);
      if (categoryResults.length > 0) {
        return hydrateBackendProducts(categoryResults, categoryIntent.backendCategoryQuery);
      }
    }

    const backendQueries = buildBackendQueries(query);
    const backendResults = await fetchBackendResults(backendQueries);
    if (backendResults.length > 0) {
      console.log("Used Go Backend for results");
      return hydrateBackendProducts(backendResults, query);
    }

    const fallbackCategoryResults = await fetchCategoryProducts(query);
    if (fallbackCategoryResults.length > 0) {
      return hydrateBackendProducts(fallbackCategoryResults, query);
    }
  } catch (error) {
    console.warn("Go Backend unavailable", error);
  }

  // No AI-simulated offers in production mode; only real backend data.
  return [];
};

export const getAIRecommendation = async (
  userQuery: string,
  products: Product[],
  history: { role: "user" | "model"; text: string }[]
): Promise<{ text: string; relatedProductIds: string[] }> => {
  if (!process.env.API_KEY) {
    return { text: "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d API-\u043a\u043b\u044e\u0447.", relatedProductIds: [] };
  }

  const productContext = products
    .slice(0, 10)
    .map((p) => `ID:${p.id}|${p.name}|${p.price}\u20bd`)
    .join("\n");
  const fullPrompt = `Context:\n${productContext}\nUser Query: "${userQuery}"\nAnswer in Russian. Recommend products. JSON { "relatedProductIds": ["id"] } at end.`;

  try {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    });
    const result = await chat.sendMessage({ message: fullPrompt });
    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let relatedProductIds: string[] = [];
    let cleanText = text;

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.relatedProductIds)) relatedProductIds = parsed.relatedProductIds;
        cleanText = text.replace(jsonMatch[0], "").trim();
      } catch {
        // Keep raw response if JSON fragment can't be parsed.
      }
    }

    return { text: cleanText, relatedProductIds };
  } catch {
    return {
      text: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u0443.",
      relatedProductIds: [],
    };
  }
};

