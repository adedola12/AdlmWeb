import { API_BASE } from "./config";

export async function api(path, init = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      ...init,
    });

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      const payload = ct.includes("application/json")
        ? await res.json().catch(() => ({}))
        : { error: await res.text().catch(() => res.statusText) };
      throw new Error(payload.error || `HTTP ${res.status}`);
    }

    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err) {
    // surface network/cors failures in the UI
    throw new Error(err?.message || "Network error");
  }
}
