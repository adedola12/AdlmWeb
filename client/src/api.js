// src/api.js
import { API_BASE } from "./config";

export async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const { error } = await res
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error || "Request failed");
  }
  return res.json();
}
