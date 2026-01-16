// import { API_BASE, IS_PROD } from "./config";

// async function refresh() {
//   const res = await fetch(`${API_BASE}/auth/refresh`, {
//     method: "POST",
//     credentials: "include",
//   });
//   if (!res.ok) throw new Error("refresh failed");
//   return res.json();
// }

// export async function apiAuthed(path, { token, ...init } = {}) {
//   const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

//   const doFetch = (tkn) =>
//     fetch(url, {
//       credentials: "include",
//       ...init,
//       headers: {
//         ...(init.headers || {}),
//         ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}),
//       },
//     });

//   let res = await doFetch(token);

//   if (res.status === 401) {
//     try {
//       const r = await refresh();
//       window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: r }));
//       res = await doFetch(r.accessToken);
//     } catch {
//       throw new Error("Unauthorized");
//     }
//   }

//   const ct = res.headers.get("content-type") || "";
//   const isJson = ct.includes("application/json");

//   if (!res.ok) {
//     const msg = isJson
//       ? (await res.json().catch(() => ({}))).error
//       : await res.text().catch(() => "");
//     throw new Error(msg || `HTTP ${res.status}`);
//   }

//   return isJson ? res.json() : res.text();
// }

// export async function api(path, init = {}) {
//   if (!API_BASE) {
//     // Fail loudly so you don’t waste time debugging HTML-as-JSON again
//     throw new Error(
//       IS_PROD
//         ? "API_BASE is missing in production. Set VITE_API_BASE on Vercel and redeploy."
//         : "API_BASE is missing. Set VITE_API_BASE in .env.local"
//     );
//   }

//   const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

//   const res = await fetch(url, {
//     credentials: "include",
//     ...init,
//     headers: {
//       ...(init.headers || {}),
//     },
//   });

//   const ct = res.headers.get("content-type") || "";
//   const isJson = ct.includes("application/json");

//   if (!res.ok) {
//     const msg = isJson
//       ? (await res.json().catch(() => ({}))).error
//       : await res.text().catch(() => res.statusText);
//     throw new Error(msg || `HTTP ${res.status}`);
//   }

//   return isJson ? res.json() : res.text();
// }

import { API_BASE, IS_PROD } from "./config";

async function refresh() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("refresh failed");
  return res.json();
}

function ensureApiBase() {
  if (!API_BASE) {
    throw new Error(
      IS_PROD
        ? "API_BASE is missing in production. Set VITE_API_BASE and redeploy."
        : "API_BASE is missing. Set VITE_API_BASE in .env.local"
    );
  }
}

function joinUrl(base, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function readError(res) {
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  if (isJson) {
    const j = await res.json().catch(() => ({}));
    return j?.error || j?.message || `HTTP ${res.status}`;
  }

  const t = await res.text().catch(() => "");
  return t || `HTTP ${res.status}`;
}

export async function apiAuthed(path, { token, ...init } = {}) {
  ensureApiBase();
  const url = joinUrl(API_BASE, path);

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

  if (!res.ok) {
    throw new Error(await readError(res));
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export async function api(path, init = {}) {
  ensureApiBase();
  const url = joinUrl(API_BASE, path);

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    throw new Error(await readError(res));
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}
