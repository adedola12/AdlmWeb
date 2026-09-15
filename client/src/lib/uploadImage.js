// Upload an image and get back a URL.
//
// Lifted out of pages/Profile.jsx so the settings screen can use the same
// path rather than carry a second copy. Two copies of an upload flow is two
// places for a signature to go stale.
//
// The shape is signed direct-to-Cloudinary: the server hands out a short-lived
// signature (POST /me/media/sign) and the browser uploads straight to
// Cloudinary with it. The file never passes through our API, which is why a
// large avatar does not tie up a Lambda, and the secret never reaches the page
// because only the signature does.

import { apiAuthed } from "../api.js";

/**
 * @param {object} opts
 * @param {File} opts.file
 * @param {string} opts.token           the caller's access token
 * @param {string} [opts.folder]        Cloudinary folder
 * @param {(pct:number)=>void} [opts.onProgress]
 * @returns {Promise<string>} the secure URL
 */
export async function uploadImage({ file, token, folder = "adlm/avatars", onProgress }) {
  if (!file) throw new Error("No file chosen.");
  if (!/^image\//.test(file.type)) {
    throw new Error("That is not an image. JPG or PNG works best.");
  }
  // Cloudinary would reject it anyway; failing here says why, before the
  // round trip.
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("That image is over 8MB. A smaller one will upload faster.");
  }

  const sig = await apiAuthed("/me/media/sign", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource_type: "image", folder }),
  });

  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", sig.timestamp);
  fd.append("signature", sig.signature);
  if (sig.folder) fd.append("folder", sig.folder);
  if (sig.public_id) fd.append("public_id", sig.public_id);
  if (sig.eager) fd.append("eager", sig.eager);

  const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);

    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          resolve(json.secure_url);
        } else {
          reject(new Error(json?.error?.message || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}
