import { Review } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");

type RawReview = {
  ID?: string | number;
  Author?: string;
  Rating?: number | string;
  Date?: string;
  Title?: string;
  Content?: string;
  Verified?: boolean;
  HelpfulCount?: number;
  Source?: string;
  id?: string | number;
  author?: string;
  rating?: number | string;
  date?: string;
  title?: string;
  content?: string;
  verified?: boolean;
  helpfulCount?: number;
  source?: string;
};

type ReviewsPayload = {
  data?: RawReview[];
  total?: number;
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

const normalizeSource = (value: string): Review["source"] => {
  const lower = value.toLowerCase();
  if (lower.includes("ozon")) return "Ozon";
  if (lower.includes("wildberries")) return "Wildberries";
  if (lower.includes("yandex")) return "Yandex Market";
  if (lower.includes("dns")) return "DNS";
  if (lower.includes("m.video") || lower.includes("mvideo")) return "M.Video";
  if (lower.includes("citilink") || lower.includes("citylink")) return "Citilink";
  if (lower.includes("pitergsm") || lower.includes("piter gsm")) return "PiterGSM";
  return "Citilink";
};

const normalizeReview = (raw: RawReview, index: number): Review => {
  const idValue = raw.id ?? raw.ID ?? `r-${index}`;
  const author = readString(raw.author ?? raw.Author) || "Покупатель";
  const rating = Math.max(0, Math.min(5, readNumber(raw.rating ?? raw.Rating)));
  const date = readString(raw.date ?? raw.Date);
  const title = readString(raw.title ?? raw.Title);
  const content = readString(raw.content ?? raw.Content);
  const verified = Boolean(raw.verified ?? raw.Verified);
  const helpfulCount = Math.max(0, Math.floor(readNumber(raw.helpfulCount ?? raw.HelpfulCount)));
  const sourceRaw = readString(raw.source ?? raw.Source) || "Citilink";

  return {
    id: String(idValue),
    author,
    rating,
    date,
    title,
    content,
    verified,
    helpfulCount,
    source: normalizeSource(sourceRaw),
  };
};

export async function fetchProductReviews(productId: number, limit = 200): Promise<Review[]> {
  if (!productId || !Number.isFinite(productId)) return [];
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/products/${encodeURIComponent(String(productId))}/reviews?limit=${limit}`
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as ReviewsPayload;
    if (!Array.isArray(payload.data)) return [];
    return payload.data.map(normalizeReview);
  } catch (error) {
    console.error("Fetch reviews failed:", error);
    return [];
  }
}

export default {
  fetchProductReviews,
};
