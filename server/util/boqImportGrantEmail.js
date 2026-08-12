// Email sent when an admin grants an account the BoQ Import
// feature. Explains what the tool is for (migrating existing Excel bills
// into ADLM), exactly how long the access runs, and how to get started —
// the goal is to ease a full transition from their current spreadsheets
// onto ADLM tools. Same visual language as expiryNotifier.js emails.

import dayjs from "dayjs";
import { sendMail } from "./mailer.js";
import {
  BOQ_IMPORT_PRODUCTS,
  subscribedBoqProducts,
} from "./boqImportAccess.js";

const WEB_URL =
  String(
    process.env.PUBLIC_WEB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.PUBLIC_FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "",
  ).trim() || "https://www.adlmstudio.net";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

function btn(href, label, bg) {
  return `
    <a href="${href}"
       style="display:inline-block;padding:12px 16px;border-radius:10px;
              background:${bg};color:#ffffff;text-decoration:none;font-weight:600;
              margin-right:10px;margin-top:8px">
      ${label}
    </a>
  `;
}

export function buildBoqImportGrantEmailHtml({
  name = "",
  organizationName = "",
  expiresAt = null,
  // [{ label: "QUIV", route: "revit" }, …] — the importable products this
  // account subscribes to. Defaults keep the mail sane if it is ever empty.
  products = [],
}) {
  const hello = name ? `Hello ${name},` : "Hello,";
  const orgLine = organizationName ? ` for <b>${organizationName}</b>` : "";
  const expiryDate = expiresAt ? dayjs(expiresAt).format("MMMM D, YYYY") : "";
  // Deep-link to a product the user actually holds, not always Quiv.
  const primary = products[0] || { label: "QUIV", route: "revit" };
  const projectsLink = joinUrl(WEB_URL, `/projects/${primary.route}`);
  const dashboardLink = joinUrl(WEB_URL, "/dashboard");
  const constantsLink = joinUrl(WEB_URL, "/rategen/material-constants");
  const productNames =
    products.length > 1
      ? products.slice(0, -1).map((p) => p.label).join(", ") +
        " and " +
        products[products.length - 1].label
      : primary.label;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 10px 0">BoQ Import access is now active</h2>
      <p style="margin:0 0 12px 0">${hello}</p>

      <p style="margin:0 0 10px 0">
        Your ADLM account${orgLine} has been granted access to
        <b>BoQ Import</b> on ${productNames} — a tool built to move your
        existing projects into ADLM without redoing any measurement.
      </p>

      <p style="margin:0 0 6px 0"><b>What it does</b></p>
      <ul style="margin:0 0 14px 0;padding-left:20px;color:#334155">
        <li>Upload your existing Excel Bills of Quantities <b>as they are</b> —
            multiple bill sheets, section headings, preliminaries and
            material/labour schedules are all understood.</li>
        <li>Each upload becomes a full project: live dashboard, Bill of
            Quantity, Budget, Valuations &amp; certificates, variations and PC
            sums.</li>
        <li><b>The material &amp; labour schedule is written for you</b> — cement,
            sand, granite, blocks, formwork, rebar and labour, worked out from
            the quantities in your bill and priced from RateGen. Your bill total
            does not change. The factors behind it are yours to edit in the
            <a href="${constantsLink}">Material Constants</a> library.</li>
        <li>Track planned vs actual as the job runs, and re-upload a newer
            copy of the workbook at any time — completion history and
            procurement marks are preserved.</li>
      </ul>

      <p style="margin:0 0 6px 0"><b>Your access</b></p>
      <p style="margin:0 0 14px 0;color:#334155">
        ${
          expiryDate
            ? `Active until <b>${expiryDate}</b>.`
            : "Active on your account."
        }
        BoQ Import runs alongside your ${productNames} subscription — if a
        subscription lapses, that product's import section pauses and resumes
        automatically on renewal. Imported projects count toward your normal
        project storage.
      </p>

      <p style="margin:0 0 6px 0"><b>Getting started</b></p>
      <p style="margin:0 0 14px 0;color:#334155">
        Open your ${primary.label} projects page and click
        <b>“Import Excel BoQ”</b> in
        the sidebar. Pick one of your current bills, give the project a name,
        and the dashboard is live in seconds. To update a bill later, open the
        project and use <b>“Update from Excel”</b>.
      </p>

      <div style="margin:10px 0 18px 0">
        ${btn(projectsLink, `Open ${primary.label} projects`, "#2563eb")}
        ${btn(dashboardLink, "Open dashboard", "#0f172a")}
      </div>

      <p style="margin:0;color:#475569;font-size:13px">
        Need a hand moving your first project across? Reply to this email or
        reach us from the Support page — we're happy to walk your team
        through it.
      </p>

      <p style="margin:18px 0 0 0">Thank you,<br/>ADLM Studio</p>
    </div>
  `;
}

/**
 * Fire the grant notification. Never throws — callers treat it as
 * fire-and-forget so a mail hiccup can't fail the grant itself.
 */
export async function sendBoqImportGrantEmail({ user, entitlement }) {
  try {
    if (!user?.email) return { ok: false, error: "no email" };
    const html = buildBoqImportGrantEmailHtml({
      name: user.firstName || user.username || "",
      organizationName:
        (user.entitlements || []).find(
          (e) => e.licenseType === "organization" && e.organizationName,
        )?.organizationName || "",
      expiresAt: entitlement?.expiresAt || null,
      products: subscribedBoqProducts(user).map((key) => ({
        label: BOQ_IMPORT_PRODUCTS[key].label,
        route: BOQ_IMPORT_PRODUCTS[key].route,
      })),
    });
    // BCC the admin mailbox: Resend sends never appear in the Gmail Sent
    // folder, so this keeps an internal copy of every grant notification.
    const adminCopy =
      process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER || "";
    await sendMail({
      to: user.email,
      subject: "BoQ Import is now active on your ADLM account",
      html,
      bcc: adminCopy || undefined,
    });
    return { ok: true };
  } catch (e) {
    console.error("[boq-import] grant email failed:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
