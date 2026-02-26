import { GoogleGenAI } from "@google/genai";
import { Product } from "../types";
import { generateReviews } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Helper to generate a random ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Backend (Go scraper) → UI hydration ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hydrateBackendProducts = (rawResults: any[], query: string): Product[] => {
  if (!Array.isArray(rawResults) || rawResults.length === 0) return [];

  // Normalize product name to group offers from разных магазинов
  const normalizeName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[«»"']/g, "")
      .replace(/\s+/g, " ")
      .replace(
        /\b(беспроводные|проводные|наушники|смартфон|телефон|ноутбук|игровой|черный|чёрный|белый|серый|серебристый|золотой|202[0-9]|202[1-9])\b/gi,
        ""
      )
      .trim();
  };

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
    offers: BackendOffer[];
  };

  const inferCategory = (name: string, q: string): Product["category"] => {
    const text = `${name} ${q}`.toLowerCase();
    if (/наушник|headphone|wh-1000xm/i.test(text)) return "headphones";
    if (/iphone|смартфон|smartphone|galaxy|pixel|xiaomi|redmi|samsung/i.test(text)) return "smartphone";
    if (/ноутбук|laptop|macbook|rog|legion|ideapad|vivobook|zenbook/i.test(text)) return "laptop";
    if (/rtx|gtx|radeon|gpu|видеокарт/i.test(text)) return "gpu";
    if (/watch|часы|смарт-час/i.test(text)) return "smartwatch";
    if (/камера|photo|объектив/i.test(text)) return "camera";
    if (/планшет|tablet|ipad/i.test(text)) return "tablet";
    // разумный дефолт
    return "smartphone";
  };

  const mapLogo = (shop: string) => {
    const s = shop.toLowerCase();
    if (s.includes("ozon")) return "ozon";
    if (s.includes("wildberries")) return "wb";
    if (s.includes("dns")) return "dns";
    if (s.includes("yandex")) return "yandex";
    if (s.includes("m.video") || s.includes("mvideo")) return "mvideo";
    if (s.includes("citilink")) return "citilink";
    return "shop";
  };

  const groups = new Map<string, BackendGroup>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of rawResults as any[]) {
    const rawName = typeof p.name === "string" && p.name.trim() ? p.name.trim() : query;
    const normKey = normalizeName(rawName) || rawName.toLowerCase();

    let group = groups.get(normKey);
    if (!group) {
      let image = typeof p.image_url === "string" ? p.image_url : "";
      if (!image || !image.startsWith("http")) {
        const seed = encodeURIComponent(rawName.split(" ").slice(0, 4).join(" ") || query);
        image = `https://source.unsplash.com/800x600/?${seed}`;
      }
      group = {
        id: generateId(),
        name: rawName,
        image,
        offers: [],
      };
      groups.set(normKey, group);
    }

    const price =
      typeof p.price === "number"
        ? p.price
        : typeof p.price === "string"
        ? Number(p.price.replace(/[^\d.,]/g, "").replace(",", "."))
        : 0;
    const shopName = typeof p.shop_name === "string" ? p.shop_name : "";
    const url = typeof p.url === "string" ? p.url : "";

    if (!price || !shopName || !url) continue;

    const offer: BackendOffer = {
      id: `offer-${group.offers.length}`,
      name: shopName,
      price: Math.round(price),
      // Точную доставку API не отдает – ставим нейтральный текст
      delivery: "Сегодня",
      rating: 4.5,
      logo: mapLogo(shopName),
      url,
    };
    group.offers.push(offer);
  }

  const products: Product[] = [];

  for (const group of groups.values()) {
    if (!group.offers.length) continue;
    group.offers.sort((a, b) => a.price - b.price);
    const best = group.offers[0];
    const basePrice = best.price;
    const category = inferCategory(group.name, query);

    products.push({
      id: group.id,
      name: group.name,
      category,
      image: group.image,
      images: [group.image],
      price: basePrice,
      rating: 4.6,
      reviewCount: 0,
      reviews: generateReviews(group.id, 3),
      specs: {},
      tags: [],
      description: group.name,
      priceHistory: [
        { date: "Ранее", price: basePrice, shopName: best.name },
        { date: "Сегодня", price: basePrice, shopName: best.name },
      ],
      offers: group.offers,
    });
  }

  // Показываем сначала самые выгодные предложения
  return products.sort((a, b) => a.price - b.price);
};

// --- Backend search helpers (multi-query for families like iPhone 15) ---

const buildBackendQueries = (query: string): string[] => {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // Специальный кейс: "iphone 15" без уточнений → все варианты линейки
  if (/iphone\s*15\b/i.test(trimmed) && !/(pro|plus|max)/i.test(trimmed)) {
    return ["iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max"];
  }

  return [trimmed];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchBackendResults = async (queries: string[]): Promise<any[]> => {
  const all: any[] = [];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const controller = new AbortController();
        // Даем бэкенду достаточно времени собрать цены со всех магазинов
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`http://localhost:8080/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.results)) {
          all.push(...data.results);
        }
      } catch {
        // игнорируем отдельные ошибки, продолжаем по другим магазинам/запросам
      }
    })
  );

  return all;
};

export const searchProductsWithAI = async (query: string): Promise<Product[]> => {
  // 1. TRY LOCAL BACKEND FIRST (The "Ultimate" Go Parser)
  // Теперь можем вызывать несколько вариантов запроса (например, всю линейку iPhone 15).
  try {
    const backendQueries = buildBackendQueries(query);
    const backendResults = await fetchBackendResults(backendQueries);
    if (backendResults.length > 0) {
      console.log("⚡ Used Go Backend for results (multi-query)");
      return hydrateBackendProducts(backendResults, query);
    }
  } catch (e) {
    // Backend недоступен – для боевого режима скрейпинга
    // не используем AI-фолбек, просто возвращаем пустой результат.
    console.warn("Go Backend unavailable", e);
  }

  // В боевом режиме скрейпинга не используем AI-симуляцию
  // для поиска товаров – только реальные данные с бэкенда.
  return [];
};

const mapSpecs = (raw: any) => {
  const specs: any = {};
  Object.entries(raw).forEach(([key, val]) => {
    specs[key.toLowerCase().replace(/\s/g, '_')] = { label: key, value: val, important: true };
  });
  return specs;
};

// generateAIStoreOffers удалён, так как в боевом режиме мы не создаём
// псевдо‑офферы на основе AI – только реальные данные с бэкенда.

export const getAIRecommendation = async (
  userQuery: string,
  products: Product[],
  history: { role: 'user' | 'model'; text: string }[]
): Promise<{ text: string; relatedProductIds: string[] }> => {
  if (!process.env.API_KEY) return { text: "API Key missing.", relatedProductIds: [] };

  const productContext = products.slice(0, 10).map(p => `ID:${p.id}|${p.name}|${p.price}₽`).join('\n');
  const fullPrompt = `Context:\n${productContext}\nUser Query: "${userQuery}"\nAnswer in Russian. Recommend products. JSON { "relatedProductIds": ["id"] } at end.`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    });
    const result = await chat.sendMessage({ message: fullPrompt });
    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let relatedProductIds: string[] = [];
    let cleanText = text;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.relatedProductIds) relatedProductIds = parsed.relatedProductIds;
        cleanText = text.replace(jsonMatch[0], '').trim();
      } catch (e) {}
    }
    return { text: cleanText, relatedProductIds };
  } catch (error) {
    return { text: "Error connecting to assistant.", relatedProductIds: [] };
  }
};