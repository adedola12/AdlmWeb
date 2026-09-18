// Verify a WhatsApp number by sending a code over WhatsApp (2026-09-18).
//
// Uses Meta's WhatsApp Cloud API with an AUTHENTICATION template (the kind
// with a copy-code button, which Meta approves for one-time codes). Off until
// all three are set in the environment, so nothing is sent and no button is
// shown before Meta is set up:
//
//   WHATSAPP_TOKEN            permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's id in WhatsApp Manager
//   WHATSAPP_TEMPLATE         the approved authentication template's name
//   WHATSAPP_TEMPLATE_LANG    optional, default "en"
//
// TODO(adlm): create the WhatsApp Business account and template, then set the
// three values in SSM /adlm/cloud/prod (see docs/WHATSAPP_SETUP.md).

import crypto from "node:crypto";

export const WA_CODE_MINUTES = 10;
export const WA_RESEND_SECONDS = 60;
export const WA_MAX_ATTEMPTS = 5;

export function whatsappEnabled(env = process.env) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE);
}

/**
 * A number as WhatsApp wants it: digits only, with the country code.
 * Nigerian local form (0803 000 0000) becomes 2348030000000. Anything that
 * cannot be a full international number comes back null.
 */
export function toWhatsAppNumber(raw) {
  const s = String(raw || "").trim();
  let d = s.replace(/[^\d]/g, "");
  if (!d) return null;
  if (!s.startsWith("+") && d.length === 11 && d.startsWith("0")) d = `234${d.slice(1)}`;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function newWaCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashWaCode(code) {
  return crypto.createHash("sha256").update(`wa:${code}`).digest("hex");
}

/** The Cloud API request body for an authentication-template code. */
export function codeMessage(to, code, env = process.env) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE,
      language: { code: env.WHATSAPP_TEMPLATE_LANG || "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}

export async function sendWhatsAppCode(to, code, { env = process.env, fetchImpl = fetch } = {}) {
  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(codeMessage(to, code, env)),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {
      /* the status is enough */
    }
    throw new Error(`WhatsApp send failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return true;
}
