// The browser half of the profile-photo rule (R08). The server makes the
// final decision (server/util/avatarCheck.js) with Cloudinary's own face
// detection; this catches the common problems before a slow upload, with the
// same wording.

export const AVATAR_MIN_PX = 200;
export const AVATAR_SQUARE_TOLERANCE = 0.02;

export function avatarSizeProblem(w, h) {
  if (Math.min(w, h) < AVATAR_MIN_PX) {
    return `Your profile photo must be at least ${AVATAR_MIN_PX} × ${AVATAR_MIN_PX} pixels. This one is ${w} × ${h}.`;
  }
  if (Math.abs(w - h) / Math.max(w, h) > AVATAR_SQUARE_TOLERANCE) {
    return `Your profile photo must be square. This one is ${w} × ${h} pixels. Crop it so the width and height are the same, then upload it again.`;
  }
  return null;
}

export const NO_FACE =
  "We could not find a face in this photo. Use a clear, well-lit photo of your face, looking at the camera.";

/** The image's pixel size, read locally before anything is uploaded. */
export function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight, img });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image. JPG or PNG works best."));
    };
    img.src = url;
  });
}

/**
 * Size and squareness always; a face too where the browser can look for one
 * (the Shape Detection API, where supported). The server checks for a face
 * regardless, so a browser without it just defers to the server.
 * @returns {Promise<string|null>} the problem, or null
 */
export async function checkAvatarFile(file) {
  const { width, height, img } = await imageSize(file);
  const size = avatarSizeProblem(width, height);
  if (size) return size;
  if (typeof window !== "undefined" && "FaceDetector" in window) {
    try {
      const faces = await new window.FaceDetector({ fastMode: true }).detect(img);
      if (!faces.length) return NO_FACE;
    } catch {
      /* the detector is optional; the server decides */
    }
  }
  return null;
}
