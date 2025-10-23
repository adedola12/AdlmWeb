// server/util/mailer.js
import nodemailer from "nodemailer";
import fetch from "node-fetch";

// small helper if text is not provided
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
    secure, // 465 = true, 587 = false
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // keep these tight so we fail over quickly
    connectionTimeout: 10_000, // 10s
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      // helps with some providers/proxies
      servername: host,
      // do NOT set rejectUnauthorized:false in production
    },
  });
}

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const transports = [
  makeTransport({ host, port: 465, secure: true }), // SMTPS first
  makeTransport({ host, port: 587, secure: false }), // STARTTLS fallback
];

export async function sendMail({ to, subject, html, text }) {
  const from =
    process.env.EMAIL_FROM || `ADLM Services <${process.env.SMTP_USER}>`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY missing; pretending to send in dev");
    console.log({ to, subject });
    return;
  }

  // const payload = {
  //   from: process.env.EMAIL_FROM || "ADLM Services <noreply@adlmstudio.net>",
  //   to: Array.isArray(to) ? to : [to],
  //   subject,
  //   html,
  //   text,
  // };

  // const res = await fetch("https://api.resend.com/emails", {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Bearer ${apiKey}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify(payload),
  // });

  // if (!res.ok) {
  //   const body = await res.text().catch(() => "");
  //   console.error("[mailer] Resend failed:", res.status, body);
  //   throw new Error("Email delivery failed");
  // }

  if (apiKey) {
    const payload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || toText(html),
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mailer] Resend failed:", res.status, body);
      throw new Error("Email delivery failed");
    }
    return;
  }

  // 2) Otherwise, use SMTP (Gmail/Workspace)
  const message = {
    from,
    to,
    subject,
    html,
    text: text || toText(html),
  };

  let lastErr;
  for (const t of transports) {
    try {
      await t.verify().catch(() => {}); // quick warm-up attempt
      const info = await t.sendMail(message);
      // console.log("[mailer] SMTP ok:", info?.messageId);
      return;
    } catch (err) {
      lastErr = err;
      console.error("[mailer] SMTP attempt failed:", err?.message || err);
    }
  }
  throw new Error(lastErr?.message || "SMTP send failed");
}
