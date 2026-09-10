// src/lib/s3Upload.js
//
// One presigned PUT, straight from the browser into the archive bucket, with
// progress read off the request itself. The API only signs the URL; the
// bytes never touch it — it runs on Lambda, where a request body is capped at
// 10MB and a demo recording is hundreds of megabytes.
//
// Content-Type is part of the signature, so exactly the type the server
// signed for is sent — not whatever the browser guesses for the file.

export function uploadToPresignedUrl({ file, uploadUrl, contentType, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", uploadUrl, true);
    x.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");
    if (onProgress && x.upload) {
      x.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) resolve({ bytes: file.size, etag: x.getResponseHeader("ETag") || "" });
      else if (x.status === 0) reject(new Error("The archive refused the connection. The bucket's CORS rule must allow PUT from this site."));
      else reject(new Error(`The archive refused the upload (${x.status}).`));
    };
    x.onerror = () =>
      reject(new Error("The upload could not reach the archive. If this keeps happening, the bucket's CORS rule is missing PUT for this site."));
    x.onabort = () => reject(Object.assign(new Error("Upload cancelled."), { cancelled: true }));
    if (signal) {
      if (signal.aborted) return x.abort();
      signal.addEventListener("abort", () => x.abort(), { once: true });
    }
    x.send(file);
  });
}
