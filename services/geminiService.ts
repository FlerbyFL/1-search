import { GoogleGenAI } from "@google/genai";
import { Product } from "../types";
import { generateReviews } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

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
  image_url?: string;
  name?: string;
  price?: number | string;
  shop_name?: string;
  shop?: string;
  url?: string;
  available?: boolean;
  category?: string;
  brand?: string;
  rating?: number | string;
  review_count?: number;
};

type BackendSearchResponse = {
  data?: BackendProduct[];
  results?: BackendProduct[];
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

const fixCitilinkProductUrl = (url: string, externalID: string): string => {
  const safeUrl = readString(url);
  const safeExternalId = readString(externalID);
  if (!safeUrl || !safeExternalId) return safeUrl;

  const match = safeExternalId.match(/^citilink_(\d+)$/i);
  if (!match) return safeUrl;

  try {
    const parsed = new URL(safeUrl);
    if (!parsed.hostname.includes("citilink.ru")) return safeUrl;
    if (!parsed.pathname.startsWith("/product/")) return safeUrl;

    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (/-\d+$/.test(pathname)) return safeUrl;

    pathname = `${pathname}-${match[1]}/`;
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return safeUrl;
  }
};

const normalizeBackendProduct = (raw: BackendProduct, fallbackName: string) => {
  const name = readString(raw.Name) || readString(raw.name) || fallbackName;
  const price = readNumber(raw.Price ?? raw.price);
  const shopName = readString(raw.Shop) || readString(raw.shop_name) || readString(raw.shop);
  const externalID = readString(raw.ExternalID);
  const url = fixCitilinkProductUrl(readString(raw.URL) || readString(raw.url), externalID);
  const image = readString(raw.image_url);
  const available = readBoolean(raw.InStock ?? raw.available, true);
  const brand = readString(raw.Brand) || readString(raw.brand);
  const category = readString(raw.Category) || readString(raw.category);
  const rating = readNumber(raw.Rating ?? raw.rating);
  const reviewCount = typeof raw.ReviewCount === "number" ? raw.ReviewCount : raw.review_count ?? 0;

  return {
    name,
    price,
    shopName,
    url,
    image,
    available,
    brand,
    category,
    rating,
    reviewCount,
  };
};

const normalizeNameForGroup = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

const inferCategory = (name: string, query: string): Product["category"] => {
  const text = `${name} ${query}`.toLowerCase();

  if (/headphone|earbud|airpods|sony wh|buds/i.test(text)) return "headphones";
  if (/iphone|smartphone|galaxy|pixel|xiaomi|redmi|samsung|poco|realme|honor/i.test(text))
    return "smartphone";
  if (/laptop|macbook|rog|legion|ideapad|vivobook|zenbook|aspire|pavilion|notebook/i.test(text))
    return "laptop";
  if (/rtx|gtx|radeon|gpu|videocard/i.test(text)) return "gpu";
  if (/watch|smartwatch|apple watch|galaxy watch|amazfit/i.test(text)) return "smartwatch";
  if (/camera|photo|canon|nikon|sony a7|fujifilm/i.test(text)) return "camera";
  if (/tablet|ipad|galaxy tab|xiaomi pad/i.test(text)) return "tablet";

  return "smartphone";
};

const mapLogo = (shop: string): string => {
  const value = shop.toLowerCase();
  if (value.includes("ozon")) return "ozon";
  if (value.includes("wildberries")) return "wb";
  if (value.includes("dns")) return "dns";
  if (value.includes("yandex")) return "yandex";
  if (value.includes("m.video") || value.includes("mvideo")) return "mvideo";
  if (value.includes("citilink")) return "citilink";
  return "shop";
};

const getFallbackImage = (name: string, query: string): string => {
  const seed = encodeURIComponent(name.split(" ").slice(0, 4).join(" ") || query);
  return `https://source.unsplash.com/800x600/?${seed}`;
};

// Backend (Go scraper) -> UI hydration
const hydrateBackendProducts = (rawResults: BackendProduct[], query: string): Product[] => {
  if (!Array.isArray(rawResults) || rawResults.length === 0) return [];

  type BackendOffer = {
    id: string;
    name: string;
    price: number;
    delivery: string;
    rating: number;
    logo: string;
    url: string;
  };

  type BackendGroup = {
    id: string;
    name: string;
    image: string;
    rating: number;
    reviewCount: number;
    offers: BackendOffer[];
  };

  const groups = new Map<string, BackendGroup>();

  for (const raw of rawResults) {
    const normalized = normalizeBackendProduct(raw, query);
    if (!normalized.name || !normalized.price || !normalized.shopName || !normalized.url) continue;

    const groupKey = normalizeNameForGroup(normalized.name);
    let group = groups.get(groupKey);

    if (!group) {
      const image = normalized.image || getFallbackImage(normalized.name, query);
      group = {
        id: generateId(),
        name: normalized.name,
        image,
        rating: normalized.rating || 4.6,
        reviewCount: normalized.reviewCount || 0,
        offers: [],
      };
      groups.set(groupKey, group);
    }

    group.offers.push({
      id: `${group.id}-${group.offers.length + 1}`,
      name: normalized.shopName,
      price: Math.round(normalized.price),
      delivery: "Сегодня",
      rating: normalized.rating || 4.5,
      logo: mapLogo(normalized.shopName),
      url: normalized.url,
    });
  }

  const products: Product[] = [];

  for (const group of groups.values()) {
    if (!group.offers.length) continue;

    group.offers.sort((a, b) => a.price - b.price);
    const bestOffer = group.offers[0];
    const category = inferCategory(group.name, query);

    products.push({
      id: group.id,
      name: group.name,
      category,
      image: group.image,
      images: [group.image],
      price: bestOffer.price,
      rating: group.rating,
      reviewCount: group.reviewCount,
      reviews: generateReviews(group.id, 3),
      specs: {},
      tags: [],
      description: group.name,
      priceHistory: [
        { date: "Ранее", price: bestOffer.price, shopName: bestOffer.name },
        { date: "Сегодня", price: bestOffer.price, shopName: bestOffer.name },
      ],
      offers: group.offers,
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

const extractBackendResults = (response: BackendSearchResponse): BackendProduct[] => {
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.results)) return response.results;
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

export const searchProductsWithAI = async (query: string): Promise<Product[]> => {
  try {
    const backendQueries = buildBackendQueries(query);
    const backendResults = await fetchBackendResults(backendQueries);
    if (backendResults.length > 0) {
      console.log("Used Go Backend for results");
      return hydrateBackendProducts(backendResults, query);
    }
  } catch (error) {
    console.warn("Go Backend unavailable", error);
  }

  // No AI-simulated offers in production mode; only real backend data.
  return [];
};

const mapSpecs = (raw: Record<string, unknown>) => {
  const specs: Record<string, { label: string; value: unknown; important: boolean }> = {};
  Object.entries(raw).forEach(([key, val]) => {
    specs[key.toLowerCase().replace(/\s/g, "_")] = { label: key, value: val, important: true };
  });
  return specs;
};

void mapSpecs;

export const getAIRecommendation = async (
  userQuery: string,
  products: Product[],
  history: { role: "user" | "model"; text: string }[]
): Promise<{ text: string; relatedProductIds: string[] }> => {
  if (!process.env.API_KEY) return { text: "API Key missing.", relatedProductIds: [] };

  const productContext = products
    .slice(0, 10)
    .map((p) => `ID:${p.id}|${p.name}|${p.price}₽`)
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
    return { text: "Error connecting to assistant.", relatedProductIds: [] };
  }
};
