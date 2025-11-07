// src/lib/video.ts
export type ParsedVideo =
  | { kind: "bunny"; libId: string; videoId: string }
  | { kind: "direct"; src: string }
  | null;

export function parseBunny(input: string = ""): ParsedVideo {
  if (!input) return null;

  const short = input.match(/^bunny:([a-z0-9]+):([a-f0-9-]+)$/i);
  if (short) return { kind: "bunny", libId: short[1], videoId: short[2] };

  const ifr = input.match(/iframe\.mediadelivery\.net\/embed\/(\w+)\/([a-f0-9-]+)/i);
  if (ifr) return { kind: "bunny", libId: ifr[1], videoId: ifr[2] };

  const cdn = input.match(/vz-([a-z0-9]+)-([a-f0-9-]+)\.b-cdn\.net/i);
  if (cdn) return { kind: "bunny", libId: cdn[1], videoId: cdn[2] };

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

  return { kind: "direct", src: input };
}

export type BunnyIframeOpts = {
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  responsive?: boolean;
};

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
