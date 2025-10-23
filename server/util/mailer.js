// server/util/mailer.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, html }) {
  const from = process.env.EMAIL_FROM || "ADLM <noreply@adlmstudio.net>";
  await transporter.sendMail({ from, to, subject, html });
}
