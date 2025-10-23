// server/util/mailer.js
import nodemailer from "nodemailer";
import fetch from "node-fetch";

// strip HTML → text
function toText(html = "") {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTransport({ host, port, secure }) {
  return nodemailer.createTransport({
    host,
    port,
    secure, // 465=true, 587=false
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: host },
  });
}

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const transports = [
  makeTransport({ host, port: 465, secure: true }),
  makeTransport({ host, port: 587, secure: false }),
];

export async function sendMail({ to, subject, html, text }) {
  const primaryFrom =
    process.env.EMAIL_FROM ||
    `ADLM Services <${process.env.SMTP_USER || "noreply@adlmstudio.net"}>`;
  const fallbackFrom = "ADLM Services <onboarding@resend.dev>"; // valid for testing

  const body = {
    subject,
    html,
    text: text || toText(html),
    to: Array.isArray(to) ? to : [to],
  };

  const apiKey = process.env.RESEND_API_KEY;

  // 1) Resend first
  if (apiKey) {
    for (const from of [primaryFrom, fallbackFrom]) {
      const payload = { from, ...body };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(
          `[mailer] Resend OK: id=${data?.id || "unknown"} from=${from}`
        );
        return;
      }

      const txt = await res.text().catch(() => "");
      console.error("[mailer] Resend failed:", res.status, txt);

      // If from-address not verified, try fallback sender
      if (res.status === 422 && from !== fallbackFrom && /from/i.test(txt)) {
        console.warn("[mailer] Retrying with onboarding@resend.dev sender");
        continue;
      }

      // Other errors: break to SMTP fallback
      break;
    }
  } else {
    console.warn("[mailer] RESEND_API_KEY missing; will try SMTP");
  }

  // 2) SMTP fallback
  const message = { from: primaryFrom, ...body };
  let lastErr;
  for (const t of transports) {
    try {
      await t.verify().catch(() => {});
      const info = await t.sendMail(message);
      console.log("[mailer] SMTP ok:", info?.messageId);
      return;
    } catch (err) {
      lastErr = err;
      console.error("[mailer] SMTP attempt failed:", err?.message || err);
    }
  }
  throw new Error(lastErr?.message || "All email attempts failed");
}
