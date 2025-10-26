// src/lib/video.ts
// Normalize ANY course video input into either a Bunny iframe URL or a direct <video> URL

export type ParsedVideo =
  | { kind: "bunny"; libId: string; videoId: string }
  | { kind: "direct"; src: string }
  | null;

/** Accepts Bunny (embed/CDN/shorthand) or Google Drive/direct MP4/WebM URLs */
export function parseBunny(input: string = ""): ParsedVideo {
  if (!input) return null;

  // bunny:<LIB_ID>:<VIDEO_ID>
  const short = input.match(/^bunny:([a-z0-9]+):([a-f0-9-]+)$/i);
  if (short) return { kind: "bunny", libId: short[1], videoId: short[2] };

  // https://iframe.mediadelivery.net/embed/<LIB_ID>/<VIDEO_ID>
  const ifr = input.match(/iframe\.mediadelivery\.net\/embed\/(\w+)\/([a-f0-9-]+)/i);
  if (ifr) return { kind: "bunny", libId: ifr[1], videoId: ifr[2] };

  // https://vz-<LIB_ID>-<VIDEO_ID>.b-cdn.net/...
  const cdn = input.match(/vz-([a-z0-9]+)-([a-f0-9-]+)\.b-cdn\.net/i);
  if (cdn) return { kind: "bunny", libId: cdn[1], videoId: cdn[2] };

  // Google Drive (legacy)
  const driveId =
    input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
    (() => {
      try {
        const u = new URL(input);
        return u.searchParams.get("id") || "";
      } catch {
        return "";
      }
    })();

  if (driveId) {
    return {
      kind: "direct",
      src: `https://drive.google.com/uc?export=download&id=${driveId}`,
    };
  }

  // Fallback: treat as direct URL (mp4/webm/cloudinary)
  return { kind: "direct", src: input };
}

export type BunnyIframeOpts = {
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  responsive?: boolean;
};

/** Build a Bunny iframe src safely (fixes TS7006 by typing params) */
export function bunnyIframeSrc(
  libId: string,
  videoId: string,
  options: BunnyIframeOpts = {}
): string {
  const params = new URLSearchParams({
    autoplay: String(options.autoplay ?? false),
    muted: String(options.muted ?? false),
    controls: String(options.controls ?? true),
    responsive: String(options.responsive ?? true),
  });
  return `https://iframe.mediadelivery.net/embed/${libId}/${videoId}?${params.toString()}`;
}

/** Optional: return a nice shorthand you can store in DB after upload */
export function bunnyShorthand(libId: string, videoId: string): string {
  return `bunny:${libId}:${videoId}`;
}
