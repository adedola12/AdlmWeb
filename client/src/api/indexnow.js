// IndexNow — tell Bing a URL changed instead of waiting to be crawled.
//
// Bing has the site indexed with no content (that is what this whole change
// set is about). Once the pages actually render, the fix is worth nothing until
// Bing recrawls, and its natural recrawl interval for a site it considers empty
// is measured in weeks. IndexNow is the supported way to say "look again now".
//
// THE PROTOCOL, IN FULL
//   1. Host a text file at /<key>.txt whose entire contents are the key. That
//      proves you control the domain.
//   2. POST { host, key, keyLocation, urlList } to an IndexNow endpoint.
//   3. Participating engines (Bing, Yandex, Seznam, Naver) share submissions,
//      so one call covers all of them.
//
// Google does not participate. It gets the sitemap and the recrawl it schedules
// itself; nothing here is a substitute for that.
//
// WHY IT IS A ROUTE AND NOT JUST A SCRIPT
// The deploy script pings this, but so can the admin UI after publishing a
// changelog or a product. Keeping the key server-side means neither caller
// needs it, and the key never reaches a browser bundle.

const IN_ENDPOINT = "https://api.indexnow.org/IndexNow";
const SITE_HOST = "www.adlmstudio.net";

/** Cap per the spec. Submitting more in one call gets the whole call rejected. */
const MAX_URLS = 10000;

function siteUrl(pathOrUrl) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return null;
  try {
    const url = value.startsWith("http")
      ? new URL(value)
      : new URL(value.replace(/^\/*/, "/"), `https://${SITE_HOST}`);
    // Submitting a URL on a host you do not own gets the key banned, so this is
    // a hard filter rather than a warning.
    if (url.hostname !== SITE_HOST) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const key = String(process.env.INDEXNOW_KEY || "").trim();

  if (!key) {
    // Not an error: the site works fine without it. Saying so plainly beats a
    // 500 that looks like a bug in the deploy.
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "INDEXNOW_KEY is not set. Submission skipped.",
      }),
    );
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ ok: false, error: "Use POST." }));
    return;
  }

  // A stray or malicious caller could burn the daily quota, so the endpoint is
  // shared-secret gated. It only ever submits this site's own URLs, which caps
  // the damage either way.
  const secret = String(process.env.INDEXNOW_TRIGGER_SECRET || "").trim();
  if (secret && req.headers["x-indexnow-secret"] !== secret) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, error: "Bad or missing secret." }));
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    if (!body) body = {};

    const urlList = [...new Set((body.urls || []).map(siteUrl).filter(Boolean))];

    if (!urlList.length) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          ok: false,
          error: `No submittable URLs. They must be on ${SITE_HOST}.`,
        }),
      );
      return;
    }

    if (urlList.length > MAX_URLS) urlList.length = MAX_URLS;

    const upstream = await fetch(IN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key,
        keyLocation: `https://${SITE_HOST}/${key}.txt`,
        urlList,
      }),
    });

    // 200 and 202 both mean accepted. 422 is the one worth reading: it means
    // the key file did not match, which is a deploy problem, not a URL problem.
    res.statusCode = upstream.ok ? 200 : 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: upstream.ok,
        submitted: urlList.length,
        upstreamStatus: upstream.status,
      }),
    );
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: e?.message || "Unknown error" }));
  }
}
