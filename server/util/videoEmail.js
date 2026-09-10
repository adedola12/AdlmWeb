// What a new-video announcement says, in HTML and in plain text.
//
// Nothing here reads the database and nothing here sends. It takes the few
// facts it needs and returns { subject, html, text }, the same contract every
// other message in util/emailContent.js honours — a template that fetches is a
// template that can fail while three hundred people are waiting on it.
//
// WHY THIS TEMPLATE DOES NOT USE wrapMarketingEmail
//
// Every other message the studio sends shares one frame, and that is worth
// protecting: a customer who gets a receipt and a password reset on the same
// day should not have to wonder whether one of them is a fake. This one is
// deliberately outside it, because it is the only message built around a
// picture. The shared frame has no place to put a 536px image, and widening
// it to make room would change the look of fourteen messages to suit one.
//
// It still reads as the same studio: same 600px column, same rounded card on a
// pale ground, same footer, same voice. What differs is the palette, which is
// the brand set for this campaign — navy, blue, orange, sky.
//
// ABOUT LEXEND
//
// The @import and the <link> are here because the brand asks for Lexend, and
// Apple Mail, Thunderbird and most mobile clients will honour one or the
// other. Gmail and every version of Outlook will not — Gmail strips the head,
// Outlook renders with Word. So every font-family below names Lexend FIRST and
// then a real stack, and the layout is built to look right in the fallback
// rather than to depend on the webfont arriving. This is not a bug to be fixed
// later; there is no way to load a webfont Gmail will use.

const NAVY = "#0D2240";
const BLUE = "#1E6BCC";
const ORANGE = "#F07020";
const SKY = "#40B0E0";
const INK_2 = "#4A5A6B";
const LINE = "#E2E8F0";
const PAPER = "#F4F6F9";

const FONT =
  "'Lexend',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const SITE = () => process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net";

export const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const firstNameOf = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/* ─────────────────────────────────────────────────────────── the excerpt ── */

// Lines that are only a URL, only hashtags, or a chapter marker like
// "00:00 Intro". A YouTube description is half prose and half furniture, and
// the furniture is never the sentence you want to put in an email.
const FURNITURE = [
  /^https?:\/\/\S+$/i,
  /^(#\S+\s*)+$/,
  /^\d{1,2}:\d{2}(:\d{2})?\b/,
  /^[-=_*~·—]{3,}$/,
];

// Not sentence ends. Without these, "Watch the full walkthrough on the ADLM
// Studio Ltd. site" becomes two sentences and the excerpt stops mid-thought.
const ABBREV = /\b(?:[A-Z]|Mr|Mrs|Ms|Dr|Prof|Eng|Arc|Ltd|Inc|Co|St|No|vs|etc|e\.g|i\.e)\.$/i;

/**
 * The first two sentences of a video description.
 *
 * Sentence splitting is famously not solvable, and this does not try to solve
 * it. It handles the two things that actually appear in these descriptions —
 * abbreviations with a full stop, and lines of links or timestamps — and takes
 * the paragraph whole when it cannot find a boundary. Getting a slightly long
 * excerpt is a much smaller failure than getting half a sentence.
 */
export function firstTwoSentences(description, maxChars = 320) {
  const prose = String(description || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !FURNITURE.some((re) => re.test(l)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!prose) return "";

  const out = [];
  let start = 0;

  for (let i = 0; i < prose.length && out.length < 2; i += 1) {
    if (!".!?".includes(prose[i])) continue;

    // Take the whole run, so "?!" reads as one ending rather than two.
    const runStart = i;
    while (i + 1 < prose.length && ".!?".includes(prose[i + 1])) i += 1;
    const run = prose.slice(runStart, i + 1);

    // An ellipsis is not a full stop. "Wait... really? Yes." is two sentences,
    // not three, and splitting on the dots would end the first one on a word
    // that was leading into the next.
    if (run.length > 1 && /^\.+$/.test(run)) continue;

    // A boundary needs whitespace after it, or to be the end of the text.
    if (i + 1 < prose.length && !/\s/.test(prose[i + 1])) continue;

    const candidate = prose.slice(start, i + 1).trim();
    if (ABBREV.test(candidate)) continue;

    out.push(candidate);
    start = i + 1;
  }

  // No boundary found at all: one long line with no punctuation is still worth
  // showing, so the whole thing goes through the length cap below.
  let text = (out.length ? out.join(" ") : prose).trim();

  if (text.length > maxChars) {
    // Cut on a word, not mid-word, and say it was cut.
    const cut = text.slice(0, maxChars);
    const space = cut.lastIndexOf(" ");
    text = `${(space > maxChars * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }

  return text;
}

/* ────────────────────────────────────────────────────────── the message ── */

/**
 * @param firstName       who it is addressed to
 * @param title           the video title
 * @param description     the raw YouTube description; the first two sentences are used
 * @param thumbnailUrl    absolute; the image is wrapped in a link to the video
 * @param videoUrl        the watch URL
 * @param unsubscribeUrl  where "stop these" points, per recipient
 */
export function newVideoMessage({
  firstName,
  title,
  description = "",
  thumbnailUrl = "",
  videoUrl,
  unsubscribeUrl = "",
}) {
  const name = firstNameOf(firstName);
  const excerpt = firstTwoSentences(description);
  const subject = `New video: ${String(title || "").trim()}`;

  const t = esc(title);
  const href = esc(videoUrl);

  // A linked image, not a background: every client that drops background
  // images would otherwise show a dead 300px gap where the point of the mail
  // was. The alt text carries the title so a client with images off still says
  // what the video is, and the border-radius is ignored by Outlook without
  // breaking anything.
  const thumb = thumbnailUrl
    ? `
      <tr>
        <td style="padding:4px 32px 0">
          <a href="${href}" style="text-decoration:none">
            <img src="${esc(thumbnailUrl)}" width="536" alt="${t}"
                 style="display:block;width:100%;max-width:536px;height:auto;border:0;
                        outline:none;text-decoration:none;border-radius:10px;
                        border:1px solid ${LINE}">
          </a>
        </td>
      </tr>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:${PAPER}">
  <!-- The line the inbox shows beside the subject. Hidden in the message. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">
    ${excerpt ? esc(excerpt) : `A new video from ADLM Studio: ${t}`}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${PAPER};padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINE};
                      border-radius:12px">

          <tr>
            <td style="padding:26px 32px 0;font-family:${FONT}">
              <span style="font-size:17px;font-weight:700;color:${NAVY}">
                ADLM <span style="color:${ORANGE}">Studio</span>
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 0">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;
                         color:${NAVY};font-weight:700">${t}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK_2}">
              <p style="margin:0 0 14px">Hi ${esc(name)},</p>
              <p style="margin:0 0 14px">I just published a new video: <strong style="color:${NAVY}">${t}</strong></p>
              ${excerpt ? `<p style="margin:0 0 14px">${esc(excerpt)}</p>` : ""}
              <p style="margin:0 0 4px">
                Watch it here:
                <a href="${href}" style="color:${BLUE};word-break:break-all">${href}</a>
              </p>
            </td>
          </tr>

          ${thumb}

          <tr>
            <td style="padding:0 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px">
                <tr>
                  <td align="center" bgcolor="${BLUE}" style="border-radius:8px">
                    <a href="${href}"
                       style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;
                              font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
                      Watch the video
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK_2}">
              <p style="margin:0 0 20px">
                If it raises a question about your own project, reply to this mail.
              </p>
              <p style="margin:0;font-size:15px;line-height:1.5;color:${NAVY}">
                <strong style="font-weight:600">Adedolapo Quasim</strong><br>
                <span style="color:${INK_2}">CEO, ADLM Studio</span>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 24px">
              <hr style="border:0;border-top:1px solid ${LINE};margin:0 0 16px">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${INK_2}">
                You are getting this because you have an ADLM Studio account.
                ${
                  unsubscribeUrl
                    ? `<a href="${esc(unsubscribeUrl)}" style="color:${SKY}">Unsubscribe from video updates</a> —
                       it will not affect receipts, licence or support mail.`
                    : ""
                }
              </p>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#8A99A8">
                ADLM Studio · Lagos, Nigeria<br>
                <a href="${esc(SITE())}" style="color:#8A99A8">adlmstudio.net</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Written by hand rather than stripped from the HTML above. A tag-stripped
  // version of a table layout reads as a wall of run-together fragments, and
  // the plain-text part is what a screen reader and a text-only client get —
  // it is the message for the people least able to work around a bad one.
  const text = [
    `Hi ${name},`,
    "",
    `I just published a new video: ${title}`,
    ...(excerpt ? ["", excerpt] : []),
    "",
    `Watch it here: ${videoUrl}`,
    "",
    "If it raises a question about your own project, reply to this mail.",
    "",
    "Adedolapo Quasim",
    "CEO, ADLM Studio",
    ...(unsubscribeUrl
      ? ["", `Unsubscribe from video updates: ${unsubscribeUrl}`]
      : []),
  ].join("\n");

  return { subject, html, text };
}

export const videoEmailBrand = { NAVY, BLUE, ORANGE, SKY };
