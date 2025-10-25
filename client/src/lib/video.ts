// src/lib/video.ts
export const extractDriveId = (url = "") => {
  if (!url) return "";
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  return "";
};

export const driveDirect = (id = "") =>
  id ? `https://drive.google.com/uc?export=download&id=${id}` : "";

export const toPlayable = (url = "") => {
  const id = extractDriveId(url);
  return id ? driveDirect(id) : url;
};
