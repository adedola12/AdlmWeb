// server/middleware/noStore.js
//
// Personal API responses must never be served from a cache, and must never
// come back as "304 Not Modified".
//
// Express computes an ETag for every JSON body and answers 304 whenever the
// browser's If-None-Match matches. That is fine for a static file. For
// /me/summary it means trusting the browser to still hold the body it cached
// last time, and when it does not (a corrupted or full disk cache, an office
// proxy that revalidates but will not serve, an extension that strips the
// entry) fetch() rejects with a bare "Failed to fetch". That is what one
// firm saw on their dashboard for weeks while the server logged a clean 304
// for every one of those requests.
//
// Two things, together:
//   1. Cache-Control: no-store, so nothing downstream keeps a copy and no
//      revalidation is ever attempted again.
//   2. Drop If-None-Match / If-Modified-Since on the way in, so the copies
//      browsers already hold get a full 200 on their next request instead of
//      a 304 they might fail to honour.
//
// The large, genuinely cacheable rate libraries are exempt: /rategen/library
// is ~900KB and polled thousands of times a week, and 304s are what make that
// affordable. Routes that set their own Cache-Control still win, because they
// run after this and overwrite the header.

const EXEMPT = [/^\/rategen(\/|$)/, /^\/rategen-v2(\/|$)/, /^\/admin\/rategen/];

export function isCacheExempt(path) {
  return EXEMPT.some((re) => re.test(path || ""));
}

export function noStore(req, res, next) {
  if (isCacheExempt(req.path)) return next();
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set("Cache-Control", "no-store");
  next();
}
