// src/http.js
import { API_BASE, IS_PROD } from "./config";

/* -------------------- helpers -------------------- */
function ensureApiBase() {
  if (!API_BASE) {
    throw new Error(
      IS_PROD
        ? "API_BASE is missing in production. Set VITE_API_BASE and redeploy."
        : "API_BASE is missing. Set VITE_API_BASE in .env.local",
    );
  }
}

function joinUrl(base, path, params) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${p}`);

  if (params && typeof params === "object") {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v))
        v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    });
  }

  return url.toString();
}

function isFormData(x) {
  return typeof FormData !== "undefined" && x instanceof FormData;
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

async function parseBody(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* -------------------- refresh -------------------- */
async function refresh() {
  ensureApiBase();
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("refresh failed");
  return res.json();
}

/* -------------------- core fetch -------------------- */
async function coreFetch(path, init = {}, authed = false) {
  ensureApiBase();

  const {
    params,
    token,
    data, // optional convenience
    body, // optional convenience
    headers,
    method,
    ...rest
  } = init || {};

  const url = joinUrl(API_BASE, path, params);

  // allow passing either `body` or `data`
  const payload = body !== undefined ? body : data;

  // default method if data/body exists and method wasn't provided
  const m = method || (payload !== undefined ? "POST" : "GET");

  const hasBody = payload !== undefined && m !== "GET" && m !== "HEAD";

  const makeFetch = (tkn) => {
    const finalHeaders = { ...(headers || {}) };

    // only set JSON headers for plain objects
    if (hasBody && !isFormData(payload) && !(payload instanceof Blob)) {
      if (!finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
        finalHeaders["Content-Type"] = "application/json";
      }
    }

    if (tkn) finalHeaders.Authorization = `Bearer ${tkn}`;

    return fetch(url, {
      method: m,
      credentials: "include",
      ...rest,
      headers: finalHeaders,
      body: hasBody
        ? isFormData(payload) || payload instanceof Blob
          ? payload
          : typeof payload === "string"
            ? payload
            : JSON.stringify(payload)
        : undefined,
    });
  };

  let res = await makeFetch(token);

  // refresh only for authed requests
  if (authed && res.status === 401) {
    try {
      const r = await refresh();
      window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: r }));
      res = await makeFetch(r.accessToken);
    } catch {
      throw new Error("Unauthorized");
    }
  }

  if (!res.ok) throw new Error(await readError(res));
  return parseBody(res);
}

/* =====================================================================
   ✅ BACKWARD-COMPAT EXPORTS
   - api(path, init)  -> returns JSON/text directly (old style)
   - api.get/post/... -> returns { data } (axios-like style)
   ===================================================================== */

/** Old style usage: await api("/x", { method:"GET" }) */
export async function api(path, init = {}) {
  return coreFetch(path, init, false);
}

/** Old style usage: await apiAuthed("/x", { method:"GET" }) */
export async function apiAuthed(path, init = {}) {
  return coreFetch(path, init, true);
}

/* axios-like wrappers: return { data } so your pages can do const {data}=... */
function attachMethods(fn, authed) {
  fn.request = async (path, opts = {}) => ({
    data: await coreFetch(path, opts, authed),
  });

  fn.get = async (path, opts = {}) => ({
    data: await coreFetch(path, { ...opts, method: "GET" }, authed),
  });

  fn.delete = async (path, opts = {}) => ({
    data: await coreFetch(path, { ...opts, method: "DELETE" }, authed),
  });

  fn.post = async (path, data = {}, opts = {}) => ({
    data: await coreFetch(path, { ...opts, method: "POST", data }, authed),
  });

  fn.put = async (path, data = {}, opts = {}) => ({
    data: await coreFetch(path, { ...opts, method: "PUT", data }, authed),
  });

  fn.patch = async (path, data = {}, opts = {}) => ({
    data: await coreFetch(path, { ...opts, method: "PATCH", data }, authed),
  });

  return fn;
}

attachMethods(api, false);
attachMethods(apiAuthed, true);
