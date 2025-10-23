// server/util/mailer.js
import nodemailer from "nodemailer";

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
    process.env.EMAIL_FROM ||
    `ADLM Services <${process.env.SMTP_USER || "noreply@adlmstudio.net"}>`;

  let lastErr;
  for (const t of transports) {
    try {
      const info = await t.sendMail({ from, to, subject, html, text });
      return info;
    } catch (err) {
      lastErr = err;
    }
  }
  // Surface a clean error while logging the real cause
  console.error("[mailer] all SMTP attempts failed:", lastErr);
  throw new Error("Email delivery failed (SMTP connection)");
}
