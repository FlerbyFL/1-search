import { Product } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

interface GoApiProduct {
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

  // Backward compatibility fields
  name?: string;
  price?: number | string;
  shop_name?: string;
  shop?: string;
  url?: string;
  image_url?: string;
  available?: boolean;
  category?: string;
  brand?: string;
  rating?: number | string;
  review_count?: number;
}

interface GoSearchResponse {
  query?: string;
  total?: number;
  data?: GoApiProduct[];
  results?: GoApiProduct[];
}

interface GoProductsResponse {
  total?: number;
  page?: number;
  limit?: number;
  data?: GoApiProduct[];
}

interface GoCategoriesResponse {
  data?: Array<{ name: string; count: number }>;
}

interface GoStatsResponse {
  total_products: number;
  available_shops: string[];
  shop_statistics: Record<string, number>;
  timestamp: string;
}

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

const inferProductCategory = (
  name: string
): "smartphone" | "laptop" | "headphones" | "gpu" | "smartwatch" | "camera" | "tablet" => {
  const text = name.toLowerCase();

  if (/headphone|earphone|earbud|airpods/i.test(text)) return "headphones";
  if (/iphone|smartphone|galaxy|pixel|xiaomi|redmi|samsung|poco|realme|honor/i.test(text)) return "smartphone";
  if (/laptop|macbook|rog|legion|ideapad|vivobook|zenbook|aspire|pavilion/i.test(text)) return "laptop";
  if (/rtx|gtx|radeon|gpu|videocard/i.test(text)) return "gpu";
  if (/watch|smartwatch|apple watch|galaxy watch/i.test(text)) return "smartwatch";
  if (/camera|canon|nikon|fujifilm|sony a7|photo/i.test(text)) return "camera";
  if (/tablet|ipad|galaxy tab|xiaomi pad/i.test(text)) return "tablet";

  return "smartphone";
};

const normalizeGoProduct = (raw: GoApiProduct) => {
  const name = readString(raw.Name) || readString(raw.name);
  const price = readNumber(raw.Price ?? raw.price);
  const shop = readString(raw.Shop) || readString(raw.shop_name) || readString(raw.shop);
  const url = fixCitilinkProductUrl(
    readString(raw.URL) || readString(raw.url),
    readString(raw.ExternalID)
  );
  const image = readString(raw.image_url);
  const rating = readNumber(raw.Rating ?? raw.rating);
  const reviewCount = typeof raw.ReviewCount === "number" ? raw.ReviewCount : raw.review_count ?? 0;
  const available = readBoolean(raw.InStock ?? raw.available, true);

  return { name, price, shop, url, image, rating, reviewCount, available };
};

const extractProducts = (payload: GoSearchResponse | GoProductsResponse): GoApiProduct[] => {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray((payload as GoSearchResponse).results)) return (payload as GoSearchResponse).results!;
  return [];
};

export const convertGoProductToUI = (goProduct: GoApiProduct): Product => {
  const normalized = normalizeGoProduct(goProduct);
  const safeName = normalized.name || "Unknown product";
  const idSource = readString(goProduct.ExternalID) || `${normalized.shop}-${safeName}-${normalized.price}`;

  return {
    id: idSource.replace(/\s+/g, "-").toLowerCase(),
    name: safeName,
    category: inferProductCategory(safeName),
    image: normalized.image || "https://via.placeholder.com/300x300?text=No+Image",
    images: [normalized.image || "https://via.placeholder.com/300x300?text=No+Image"],
    price: Math.round(normalized.price || 0),
    rating: normalized.rating || 4.5,
    reviewCount: normalized.reviewCount || 0,
    reviews: [],
    specs: {},
    priceHistory: [],
    tags: [],
    description: safeName,
    offers: [
      {
        id: `${idSource}-offer-1`,
        name: normalized.shop || "Store",
        price: Math.round(normalized.price || 0),
        delivery: "Сегодня",
        rating: normalized.rating || 4.5,
        logo: "shop",
        url: normalized.url || "#",
      },
    ],
  };
};

export async function searchProducts(query: string): Promise<Product[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(`${API_BASE}/api/v1/products/search?q=${encodeURIComponent(query)}&limit=100`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Search failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const payload: GoSearchResponse = await response.json();
    const products = extractProducts(payload).map(convertGoProductToUI);

    const grouped = new Map<string, Product[]>();
    products.forEach((product) => {
      const key = product.name.toLowerCase().trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(product);
    });

    const compact: Product[] = [];
    grouped.forEach((items) => {
      const sorted = items.sort((a, b) => a.price - b.price);
      compact.push(...sorted.slice(0, 3));
    });

    return compact;
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

export async function getStatistics(): Promise<GoStatsResponse | null> {
  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      fetch(`${API_BASE}/api/v1/products?page=1&limit=100`),
      fetch(`${API_BASE}/api/v1/categories`),
    ]);

    if (!productsResponse.ok || !categoriesResponse.ok) {
      console.error("Stats request failed");
      return null;
    }

    const productsPayload: GoProductsResponse = await productsResponse.json();
    const categoriesPayload: GoCategoriesResponse = await categoriesResponse.json();
    const products = extractProducts(productsPayload);

    const shopStatistics: Record<string, number> = {};
    products.forEach((product) => {
      const shop = readString(product.Shop) || readString(product.shop_name) || readString(product.shop) || "unknown";
      shopStatistics[shop] = (shopStatistics[shop] || 0) + 1;
    });

    if (Array.isArray(categoriesPayload.data)) {
      categoriesPayload.data.forEach((category) => {
        const key = `category:${category.name}`;
        shopStatistics[key] = category.count;
      });
    }

    return {
      total_products: productsPayload.total || products.length,
      available_shops: Object.keys(shopStatistics).filter((key) => !key.startsWith("category:")),
      shop_statistics: shopStatistics,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Stats error:", error);
    return null;
  }
}

export async function triggerFullParse(): Promise<null> {
  console.warn("triggerFullParse is not supported by the current backend API.");
  return null;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.status === 200;
  } catch (error) {
    console.error("API health check failed:", error);
    return false;
  }
}

export default {
  searchProducts,
  getStatistics,
  triggerFullParse,
  checkApiHealth,
};
