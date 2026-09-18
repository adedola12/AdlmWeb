// The channel's public upload feed (R10): the newest fifteen uploads, with no
// API key. YouTube publishes it at /feeds/videos.xml?channel_id=UC…; it is
// plain Atom, read here with a few patterns rather than a new dependency.
//
// Shorts are in the feed too, linked as /shorts/<id>. The free library is the
// long-form lessons, so they are marked and the caller leaves them out.

const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

/** @returns {Array<{ youtubeId: string, title: string, publishedAt: Date|null, thumbnailUrl: string, isShort: boolean }>} */
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const youtubeId = tag(e, "yt:videoId");
    if (!youtubeId) continue;
    const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || "";
    const thumb = (e.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || "";
    const published = tag(e, "published");
    out.push({
      youtubeId,
      title: tag(e, "title"),
      publishedAt: published ? new Date(published) : null,
      thumbnailUrl: thumb || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      isShort: /\/shorts\//.test(link),
    });
  }
  return out;
}

export async function fetchChannelFeed(channelId, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!channelId) throw new Error("No YouTube channel id");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { signal: ctl.signal },
    );
    if (!res.ok) throw new Error(`YouTube feed answered ${res.status}`);
    return parseFeed(await res.text());
  } finally {
    clearTimeout(t);
  }
}
