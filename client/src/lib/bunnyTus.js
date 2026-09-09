// src/lib/bunnyTus.js
//
// Streams a file from the browser straight to Bunny Stream over TUS, with a
// progress callback. No library: the protocol is a POST to open the upload
// and PATCHes of consecutive byte ranges, and that is small enough to own —
// and owning it means the progress bar reads the real offset Bunny has
// acknowledged rather than what the socket has sent.
//
// The credential (`tus`) comes from POST /admin/org-videos/:id/upload/bunny.
// It is a hash of the API key, not the key, and it expires; the browser never
// sees anything it could reuse against the library.
// https://docs.bunny.net/reference/tus-resumable-uploads

const CHUNK = 24 * 1024 * 1024; // 24MB — big enough to be efficient, small enough to retry cheaply
const TRIES = 4;

const b64 = (s) => btoa(unescape(encodeURIComponent(String(s))));

function authHeaders(tus) {
  return {
    "Tus-Resumable": "1.0.0",
    AuthorizationSignature: tus.signature,
    AuthorizationExpire: String(tus.expire),
    VideoId: tus.videoId,
    LibraryId: tus.libraryId,
  };
}

function xhr(method, url, { headers = {}, body = null, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    if (onProgress && x.upload) {
      x.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }
    x.onload = () => resolve(x);
    x.onerror = () => reject(new Error("The connection to Bunny dropped."));
    x.onabort = () => reject(Object.assign(new Error("Upload cancelled."), { cancelled: true }));
    if (signal) {
      if (signal.aborted) return x.abort();
      signal.addEventListener("abort", () => x.abort(), { once: true });
    }
    x.send(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Where Bunny thinks the upload is up to. Used to resume after a chunk fails
 * mid-flight, so a dropped connection costs one chunk and not the file.
 */
async function currentOffset(uploadUrl, tus) {
  const r = await xhr("HEAD", uploadUrl, { headers: authHeaders(tus) });
  if (r.status < 200 || r.status >= 300) throw new Error(`Bunny would not report the upload offset (${r.status}).`);
  const off = Number(r.getResponseHeader("Upload-Offset"));
  if (!Number.isFinite(off)) throw new Error("Bunny did not report an upload offset.");
  return off;
}

/**
 * @param file      the File
 * @param tus       { endpoint, libraryId, videoId, signature, expire, metadata }
 * @param onProgress (sentBytes, totalBytes) — called often
 * @param signal    AbortSignal, optional
 */
export async function uploadToBunnyTus({ file, tus, onProgress, signal }) {
  if (!file || !file.size) throw new Error("Nothing to upload.");
  const total = file.size;
  const meta = tus.metadata || {};
  const metadata = [
    `filetype ${b64(meta.filetype || file.type || "video/mp4")}`,
    `title ${b64(meta.title || file.name)}`,
  ].join(",");

  // Open the upload.
  const open = await xhr("POST", tus.endpoint, {
    headers: {
      ...authHeaders(tus),
      "Upload-Length": String(total),
      "Upload-Metadata": metadata,
    },
    signal,
  });
  if (open.status !== 201) {
    throw new Error(`Bunny refused to open the upload (${open.status}${open.responseText ? `: ${open.responseText.slice(0, 160)}` : ""}).`);
  }
  const location = open.getResponseHeader("Location");
  if (!location) throw new Error("Bunny opened the upload but did not say where to send it.");
  const uploadUrl = new URL(location, tus.endpoint).toString();

  // Send it, one range at a time.
  let offset = 0;
  onProgress?.(0, total);
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    const chunk = file.slice(offset, end);
    let sent = false;
    for (let attempt = 1; attempt <= TRIES && !sent; attempt += 1) {
      try {
        const r = await xhr("PATCH", uploadUrl, {
          headers: {
            ...authHeaders(tus),
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
          },
          body: chunk,
          signal,
          onProgress: (loaded) => onProgress?.(Math.min(total, offset + loaded), total),
        });
        if (r.status === 204 || r.status === 200) {
          const next = Number(r.getResponseHeader("Upload-Offset"));
          offset = Number.isFinite(next) ? next : end;
          sent = true;
        } else if (r.status === 409 || r.status === 412) {
          // Offset disagreement: ask Bunny where it is and carry on from there.
          offset = await currentOffset(uploadUrl, tus);
          sent = true;
        } else {
          throw new Error(`Bunny rejected a chunk (${r.status}).`);
        }
      } catch (e) {
        if (e.cancelled || attempt === TRIES) throw e;
        await sleep(800 * attempt);
        try {
          offset = await currentOffset(uploadUrl, tus);
          sent = true; // loop re-slices from the real offset
        } catch {
          /* the next attempt re-sends the same range */
        }
      }
    }
    onProgress?.(offset, total);
  }
  return { uploadUrl, bytes: total };
}

/**
 * A plain presigned PUT (the R2 fallback). Same progress contract.
 */
export function uploadToPresignedUrl({ file, uploadUrl, contentType, onProgress, signal }) {
  return xhr("PUT", uploadUrl, {
    headers: { "Content-Type": contentType || file.type || "application/octet-stream" },
    body: file,
    signal,
    onProgress,
  }).then((r) => {
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`The storage refused the upload (${r.status}).`);
    }
    return { bytes: file.size };
  });
}
