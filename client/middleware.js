// middleware.js (place at Vercel root)
import { rewrite, next } from "@vercel/functions";

export const config = {
  matcher: ["/((?!api/|assets/|.*\\..*).*)"],
};

export default function middleware(request) {
  const method = request.method || "GET";
  if (method !== "GET" && method !== "HEAD") return next();

  const u = new URL(request.url);
  const target = new URL("/api/meta", request.url);
  target.searchParams.set("path", u.pathname);

  return rewrite(target);
}
