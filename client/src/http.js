import { API_BASE, IS_PROD } from "./config";

async function refresh() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("refresh failed");
  return res.json();
}

// export async function apiAuthed(path, { token, ...init } = {}) {
//   const doFetch = (tkn) =>
//     fetch(`${API_BASE}${path}`, {
//       credentials: "include",
//       ...init,
//       headers: {
//         ...(init.headers || {}),
//         ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
//       },
//     });

//   let res = await doFetch(token);

//   if (res.status === 401) {
//     // try one refresh
//     try {
//       const r = await refresh();
//       window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: r }));
//       res = await doFetch(r.accessToken);
//     } catch {
//       // optional: nuke any cached token/state here
//       throw new Error("refresh failed");
//     }
//   }

//   if (!res.ok) throw new Error(await res.text());
//   return res.json();
// }

export async function apiAuthed(path, { token, ...init } = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const doFetch = (tkn) =>
    fetch(url, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
      },
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    try {
      const r = await refresh();
      window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: r }));
      res = await doFetch(r.accessToken);
    } catch {
      throw new Error("Unauthorized");
    }
  }

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    const msg = isJson
      ? (await res.json().catch(() => ({}))).error
      : await res.text().catch(() => "");
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return isJson ? res.json() : res.text();
}

export async function api(path, init = {}) {
  if (!API_BASE) {
    // Fail loudly so you don’t waste time debugging HTML-as-JSON again
    throw new Error(
      IS_PROD
        ? "API_BASE is missing in production. Set VITE_API_BASE on Vercel and redeploy."
        : "API_BASE is missing. Set VITE_API_BASE in .env.local"
    );
  }

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    const msg = isJson
      ? (await res.json().catch(() => ({}))).error
      : await res.text().catch(() => res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return isJson ? res.json() : res.text();
}
