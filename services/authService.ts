import { User } from "../types";

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");

type AuthPayload = {
  user?: Partial<User> & {
    id?: string | number;
    cart?: string[];
    wishlist?: string[];
    history?: string[];
  };
  error?: string;
};

const normalizeUser = (raw: AuthPayload["user"]): User => {
  const email = (raw?.email || "").trim();
  const idValue = raw?.id ?? "";
  const id = typeof idValue === "number" ? `u-${idValue}` : String(idValue || `u-${Date.now()}`);

  return {
    id,
    name: (raw?.name || "Пользователь").trim(),
    email,
    avatar: (raw?.avatar || `https://i.pravatar.cc/150?u=${email}`).trim(),
    cart: Array.isArray(raw?.cart) ? raw!.cart : [],
    wishlist: Array.isArray(raw?.wishlist) ? raw!.wishlist : [],
    history: Array.isArray(raw?.history) ? raw!.history : [],
    bonuses: typeof raw?.bonuses === "number" ? raw.bonuses : 0,
    status: raw?.status === "Gold" || raw?.status === "Platinum" ? raw.status : "Silver",
  };
};

const parseError = (payload: AuthPayload | null, fallback: string): string => {
  if (payload?.error && payload.error.trim()) return payload.error;
  return fallback;
};

async function submitAuth(path: string, body: Record<string, string>): Promise<User> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Не удалось подключиться к серверу авторизации.");
  }

  let payload: AuthPayload | null = null;
  try {
    payload = (await response.json()) as AuthPayload;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.user) {
    if (response.status === 409) {
      throw new Error("Пользователь с таким email уже существует.");
    }
    if (response.status === 401) {
      throw new Error("Неверный email или пароль.");
    }
    if (response.status === 400) {
      throw new Error(parseError(payload, "Проверьте корректность введенных данных."));
    }
    throw new Error(parseError(payload, "Ошибка авторизации. Попробуйте позже."));
  }

  return normalizeUser(payload.user);
}

export const registerUser = (name: string, email: string, password: string): Promise<User> =>
  submitAuth("/api/v1/auth/register", { name, email, password });

export const loginUser = (email: string, password: string): Promise<User> =>
  submitAuth("/api/v1/auth/login", { email, password });
