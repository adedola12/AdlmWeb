// utils/drive.js (front-end helper you can co-locate)
export function toDriveEmbed(url = "") {
  // Accepts a Drive share link or file id; returns an iframe-friendly URL
  const fileId = (() => {
    if (!url) return "";
    // file id only?
    if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return url;
    try {
      const u = new URL(url);
      if (/drive\.google\.com$/.test(u.hostname)) {
        // formats: /file/d/<id>/view | /open?id=<id>
        const m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
        const id = u.searchParams.get("id");
        if (id) return id;
      }
    } catch {}
    return "";
  })();
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : "";
}
