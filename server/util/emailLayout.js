// One frame for every message the studio sends.
//
// Before this, each email carried its own inline styles and each one looked
// slightly different — different greeting, different button, different sign
// off. A customer who gets a receipt and a password reset from the same firm
// on the same day should not have to wonder whether one of them is a fake.
//
// WHY THE STYLING IS INLINE AND THE MARKUP IS TABLES
//
// Not nostalgia. Gmail strips <style> blocks, Outlook renders with Word's
// engine and ignores most of flexbox and all of grid, and a dozen clients drop
// background images. Inline styles on nested tables is the only thing that
// survives all of them. It is ugly to write and it is what arrives intact.
//
// WHY THERE IS A PREHEADER
//
// The line a mail client shows in the inbox list after the subject. Left
// unset, clients pull the first words of the body, so a message shows up as
// "View this in your browser" or the start of a logo's alt text. It is
// hidden in the message itself.

const BRAND = "#E86A27";
const INK = "#0E1620";
const INK_2 = "#4A5A6B";
const LINE = "#E2E8F0";
const PAPER = "#F4F6F9";

const SITE = process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net";

/**
 * @param title      the <h1> at the top of the message
 * @param preheader  the line the inbox shows beside the subject
 * @param body       HTML for the message itself
 * @param cta        optional { label, href } — one button, never two
 * @param footNote   optional line under the rule, above the address
 */
export function wrapEmail({ title, preheader = "", body, cta = null, footNote = "" }) {
  const button = cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px">
        <tr>
          <td align="center" bgcolor="${BRAND}" style="border-radius:8px">
            <a href="${cta.href}"
               style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;
                      font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">
              ${cta.label}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${INK_2}">
        If the button does not work, copy this into your browser:<br>
        <span style="color:${INK_2};word-break:break-all">${cta.href}</span>
      </p>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER}">
  <!-- The inbox preview line. Hidden in the message itself. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${PAPER};padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:12px">

          <tr>
            <td style="padding:26px 32px 0">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:${INK}">
                ADLM <span style="color:${BRAND}">Studio</span>
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 0">
              <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;
                         line-height:1.3;color:${INK};font-weight:bold">${title}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                       line-height:1.65;color:${INK_2}">
              ${body}
              ${button}
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px 24px">
              <hr style="border:0;border-top:1px solid ${LINE};margin:0 0 16px">
              ${
                footNote
                  ? `<p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;
                              line-height:1.6;color:${INK_2}">${footNote}</p>`
                  : ""
              }
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                        line-height:1.6;color:#8A99A8">
                ADLM Studio · Lagos, Nigeria<br>
                <a href="${SITE}" style="color:#8A99A8">adlmstudio.net</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * The same frame, plus an unsubscribe line.
 *
 * Only marketing uses it. A receipt and a password reset are not marketing and
 * must not carry an unsubscribe link — somebody who opts out of the newsletter
 * has not opted out of being told their card failed.
 */
export function wrapMarketingEmail({ title, preheader, body, cta, unsubscribeUrl }) {
  return wrapEmail({
    title,
    preheader,
    body,
    cta,
    footNote:
      `You are getting this because you have an ADLM Studio account. ` +
      `<a href="${unsubscribeUrl}" style="color:#8A99A8">Stop receiving these</a> — ` +
      `it will not affect receipts, licence or support mail.`,
  });
}

export const emailBrand = { BRAND, INK, INK_2, LINE, PAPER, SITE };
