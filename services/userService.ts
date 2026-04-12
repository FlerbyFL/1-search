import { User } from "../types";

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");

type UserPayload = {
  user?: User;
  error?: string;
};

const parseUserPayload = (payload: UserPayload | null): User | null => {
  if (!payload || !payload.user) return null;
  return payload.user;
};

export async function fetchUserById(userId: string): Promise<User | null> {
  if (!userId) return null;
  try {
    const response = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(userId)}`);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as UserPayload;
    return parseUserPayload(payload);
  } catch (error) {
    console.error("Fetch user failed:", error);
    return null;
  }
}

export async function updateUserLists(
  userId: string,
  data: { cart: string[]; wishlist: string[]; history: string[] }
): Promise<User | null> {
  if (!userId) return null;
  try {
    const response = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cart: data.cart,
        wishlist: data.wishlist,
        history: data.history,
      }),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as UserPayload;
    return parseUserPayload(payload);
  } catch (error) {
    console.error("Update user failed:", error);
    return null;
  }
}

export async function updateUserProfile(userId: string, data: { name: string }): Promise<User | null> {
  if (!userId) return null;
  try {
    const response = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(userId)}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: data.name }),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as UserPayload;
    return parseUserPayload(payload);
  } catch (error) {
    console.error("Update profile failed:", error);
    return null;
  }
}

export async function uploadUserAvatar(userId: string, file: File): Promise<User | null> {
  if (!userId) return null;
  const formData = new FormData();
  formData.append("avatar", file);
  try {
    const response = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(userId)}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as UserPayload;
    return parseUserPayload(payload);
  } catch (error) {
    console.error("Upload avatar failed:", error);
    return null;
  }
}

export default {
  fetchUserById,
  updateUserLists,
  updateUserProfile,
  uploadUserAvatar,
};
