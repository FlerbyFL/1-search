/**
 * Go Backend Service - Интеграция с PostgreSQL через Go API
 * Работает на http://localhost:8080
 */

import { Product } from "../types";

const API_BASE = "http://localhost:8080";
const PARSE_TOKEN = "secret-parse-token-2026";

// Интерфейсы для ответов от Go API
interface GoApiProduct {
  name: string;
  price: number;
  shop_name: string;
  url: string;
  image_url: string;
  available: boolean;
}

interface GoSearchResponse {
  query: string;
  results: GoApiProduct[];
}

interface GoStatsResponse {
  total_products: number;
  available_shops: string[];
  shop_statistics: Record<string, number>;
  timestamp: string;
}

interface GoParseAllResponse {
  duration: string;
  total_products: number;
  results: GoApiProduct[];
}

/**
 * Преобразование Go API ответа в формат Product для UI
 */
export const convertGoProductToUI = (goProduct: GoApiProduct): Product => {
  return {
    id: `${goProduct.shop_name}-${goProduct.name}`.replace(/\s+/g, "-"),
    name: goProduct.name,
    price: goProduct.price,
    shop: goProduct.shop_name,
    image: goProduct.image_url || "https://via.placeholder.com/300x300?text=No+Image",
    url: goProduct.url || "",
    rating: 0, // Go API не возвращает рейтинг пока что
    available: goProduct.available,
    category: inferProductCategory(goProduct.name),
  };
};

/**
 * Определение категории товара по названию
 */
const inferProductCategory = (name: string): "smartphone" | "laptop" | "headphones" | "other" => {
  const text = name.toLowerCase();

  if (/наушник|headphone|earphone/i.test(text)) return "headphones";
  if (/iphone|смартфон|smartphone|galaxy|pixel|xiaomi|redmi|samsung|poco|realme|honor/i.test(text))
    return "smartphone";
  if (/ноутбук|laptop|macbook|rog|legion|ideapad|vivobook|zenbook|aspire|pavilion/i.test(text))
    return "laptop";

  return "other";
};

/**
 * Поиск товаров в PostgreSQL базе через Go API
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Search failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: GoSearchResponse = await response.json();

    // Преобразуем результаты в UI формат
    const products: Product[] = data.results.map(convertGoProductToUI);

    // Группируем по названию и сортируем по цене
    const grouped = new Map<string, Product[]>();
    products.forEach((p) => {
      const key = p.name.toLowerCase().trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    });

    // Берем по 3 самых дешевых из каждой группы
    const result: Product[] = [];
    grouped.forEach((items) => {
      const sorted = items.sort((a, b) => a.price - b.price);
      result.push(...sorted.slice(0, 3));
    });

    return result;
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

/**
 * Получить статистику по товарам в БД
 */
export async function getStatistics(): Promise<GoStatsResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);

    if (!response.ok) {
      console.error(`Stats request failed: ${response.status}`);
      return null;
    }

    const data: GoStatsResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Stats error:", error);
    return null;
  }
}

/**
 * Запустить полный парсинг всех магазинов
 * (требует токен)
 */
export async function triggerFullParse(): Promise<GoParseAllResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/api/parse-all`, {
      method: "GET",
      headers: {
        "X-Parse-Token": PARSE_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Parse request failed: ${response.status}`);
      return null;
    }

    const data: GoParseAllResponse = await response.json();
    console.log(`Parsing complete in ${data.duration}, collected ${data.total_products} products`);
    return data;
  } catch (error) {
    console.error("Parse error:", error);
    return null;
  }
}

/**
 * Проверить доступность Go API
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/healthz`);
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
