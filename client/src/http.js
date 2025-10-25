// src/http.js
import { API_BASE } from "./config";

async function refresh() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("refresh failed");
  return res.json();
}

export async function apiAuthed(path, { token, ...init } = {}) {
  const doFetch = (tkn) =>
    fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
      },
    });

  let res = await doFetch(token);
  if (res.status !== 401) {
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } 

  // try to refresh once
  const r = await refresh();
  // let the app store capture the new access token if needed:
  
  window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: r }));
  res = await doFetch(r.accessToken);

  if (!res.ok) throw new Error(await res.text());
  return res.json();
} 
