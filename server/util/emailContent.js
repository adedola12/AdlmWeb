// What each message actually says.
//
// One place, so the wording can be read end to end without opening fourteen
// route files, and so the Emails screen can show a person what a customer
// receives rather than "the wording lives in routes/auth.js".
//
// HOUSE STYLE
//
// Written to somebody running a quantity surveying practice, not to a user.
// Say the thing, say what to do, stop. No "we are thrilled", no "simply click
// below", no exclamation marks in a receipt. A subject line says what the mail
// is, because that is what a person scans for six weeks later when they need
// to find it again.
//
// Every function returns { subject, html } and takes the few facts it needs.
// Nothing here reads the database — a template that fetches is a template that
// can fail while somebody is waiting to be told their password was reset.

import { wrapEmail, wrapMarketingEmail, emailBrand } from "./emailLayout.js";

const { SITE } = emailBrand;

const money = (n, cur = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const p = (t) => `<p style="margin:0 0 14px">${t}</p>`;

/** A six-digit code, shown big enough to read off a phone. */
const codeBlock = (code) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
    <tr>
      <td style="background:#F4F6F9;border:1px solid #E2E8F0;border-radius:10px;padding:16px 26px;
                 font-family:'Courier New',Courier,monospace;font-size:30px;letter-spacing:8px;
                 font-weight:bold;color:#0E1620">${code}</td>
    </tr>
  </table>`;

const first = (name) => String(name || "").trim().split(" ")[0] || "there";

/* ══════════════════════════════════════════════════════════ the account ══ */

export function verifyEmail({ firstName, code, minutes = 30 }) {
  return {
    subject: `${code} is your ADLM confirmation code`,
    // The code goes in the subject because a person reading this on a phone
    // can then type it without opening the mail at all.
    html: wrapEmail({
      title: "Confirm your email address",
      preheader: `Your code is ${code}. It lasts ${minutes} minutes.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p("Enter this code on the site to finish setting up your ADLM account.") +
        codeBlock(code) +
        p(`It lasts ${minutes} minutes. If it expires, ask for another one.`) +
        p(
          "Until the address is confirmed you can sign in and look around, but you cannot buy " +
            "anything or download an installer — we will not sell a licence to an address we " +
            "cannot reach.",
        ),
      footNote:
        "If you did not create an ADLM account, ignore this. Nothing happens until the code is used.",
    }),
  };
}

export function welcome({ firstName }) {
  return {
    subject: "Your ADLM account is ready",
    html: wrapEmail({
      title: "Your account is ready",
      preheader: "Here is where to start.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          "Your email is confirmed and the account is open. Everything you buy, every project " +
            "you keep and every certificate you earn lives in one place.",
        ),
      cta: { label: "Open your account", href: `${SITE}/manage` },
      footNote: "Questions go to support from inside your account, and reach a person.",
    }),
  };
}

/* ══════════════════════════════════════════════════════════════ billing ══ */

export function invoiceIssued({ firstName, number, total, currency, dueOn, href }) {
  return {
    subject: `Invoice ${number} from ADLM Studio`,
    html: wrapEmail({
      title: `Invoice ${number}`,
      preheader: `${money(total, currency)}${dueOn ? `, due ${dueOn}` : ""}.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(`Invoice <b>${number}</b> is attached and comes to <b>${money(total, currency)}</b>.`) +
        (dueOn ? p(`It is due on <b>${dueOn}</b>.`) : ""),
      cta: href ? { label: "View the invoice", href } : null,
      footNote: "Already paid? Then this crossed with your transfer and no action is needed.",
    }),
  };
}

export function receipt({ firstName, number, total, currency, paidOn }) {
  return {
    subject: `Receipt ${number} from ADLM Studio`,
    html: wrapEmail({
      title: `Receipt ${number}`,
      preheader: `${money(total, currency)} received. Thank you.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          `We have received <b>${money(total, currency)}</b>${paidOn ? ` on <b>${paidOn}</b>` : ""}. ` +
            "This is your receipt — keep it for your records.",
        ),
      footNote: "Your receipts are also in your account, under Billing, for as long as you have one.",
    }),
  };
}

export function renewed({ firstName, productName, amount, currency, nextOn }) {
  return {
    subject: `${productName} renewed — ${money(amount, currency)}`,
    html: wrapEmail({
      title: `${productName} has renewed`,
      preheader: `${money(amount, currency)} charged${nextOn ? `. Next on ${nextOn}.` : "."}`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          `Your <b>${productName}</b> subscription renewed and <b>${money(amount, currency)}</b> ` +
            "was charged to the card on file. Nothing is interrupted.",
        ) +
        (nextOn ? p(`The next renewal is <b>${nextOn}</b>.`) : ""),
      cta: { label: "See your subscriptions", href: `${SITE}/manage/billing` },
      footNote: "To stop a renewal, turn it off in Billing before the next date above.",
    }),
  };
}

export function paymentFailed({ firstName, productName, amount, currency, retryOn }) {
  return {
    subject: `${productName}: the payment did not go through`,
    // The message that most needs to read as help rather than as a warning.
    html: wrapEmail({
      title: "That payment did not go through",
      preheader: "Your access is fine for now — the card needs a look.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          `We tried to charge <b>${money(amount, currency)}</b> for <b>${productName}</b> and the ` +
            "card declined it. That is usually a limit or an expiry rather than anything wrong.",
        ) +
        (retryOn ? p(`We will try again on <b>${retryOn}</b>. Nothing stops before then.`) : "") +
        p("Updating the card takes a minute and there is nothing else to do."),
      cta: { label: "Update the card", href: `${SITE}/manage/billing` },
    }),
  };
}

/* ══════════════════════════════════════════════════════════════ the work ══ */

export function quotation({ firstName, total, currency, href, validUntil }) {
  return {
    subject: `Your ADLM Studio quotation — ${money(total, currency)}`,
    html: wrapEmail({
      title: "Your quotation",
      preheader: `${money(total, currency)}${validUntil ? `, held until ${validUntil}` : ""}.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(`Your quotation comes to <b>${money(total, currency)}</b>.`) +
        (validUntil ? p(`These figures are held until <b>${validUntil}</b>.`) : ""),
      cta: href ? { label: "Open the quotation", href } : null,
      footNote: "Reply to this message if anything on it should be different.",
    }),
  };
}

export function projectInvite({ firstName, invitedBy, projectName, href }) {
  return {
    subject: `${invitedBy} has invited you to "${projectName}"`,
    html: wrapEmail({
      title: "You have been invited to a project",
      preheader: `${invitedBy} shared ${projectName} with you.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(`<b>${invitedBy}</b> has invited you to work on <b>${projectName}</b>.`) +
        p("You will see the bill, the rates behind it and the programme, as they stand today."),
      cta: href ? { label: "Open the project", href } : null,
    }),
  };
}

export function entitlementGranted({ firstName, productName, href }) {
  return {
    subject: `${productName} is now active on your ADLM account`,
    html: wrapEmail({
      title: `${productName} is active`,
      preheader: "It is on your account now.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(`<b>${productName}</b> has been added to your account and is ready to use.`),
      cta: { label: "Open your products", href: href || `${SITE}/manage/products` },
    }),
  };
}

/* ═════════════════════════════════════════════════════════════ support ══ */

export function supportReceived({ firstName, ref, title }) {
  return {
    subject: `We have your support request${ref ? ` (${ref})` : ""}`,
    html: wrapEmail({
      title: "We have your request",
      preheader: "A person will read it, not a robot.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(`We have your request${title ? ` about <b>${title}</b>` : ""} and somebody will read it.`) +
        p(
          "If it is stopping you working, say so in a reply — that moves it up rather than " +
            "leaving it in date order.",
        ),
      footNote: ref ? `Quote ${ref} if you write to us about this again.` : "",
    }),
  };
}

export function supportUpdated({ firstName, ref, message, href }) {
  return {
    subject: `Update on your ADLM support request${ref ? ` (${ref})` : ""}`,
    html: wrapEmail({
      title: "There is an update on your request",
      preheader: "Somebody has replied.",
      body:
        p(`Hello ${first(firstName)},`) +
        (message
          ? `<blockquote style="margin:0 0 14px;padding:12px 16px;background:#F4F6F9;
               border-left:3px solid #E86A27;border-radius:0 8px 8px 0">${message}</blockquote>`
          : p("Somebody has replied to your request.")),
      cta: href ? { label: "See the whole thread", href } : null,
    }),
  };
}

/* ════════════════════════════════════════════════════════════ training ══ */

export function trainingProposed({ firstName, courseName, dates, href }) {
  return {
    subject: `A date for your ADLM training${courseName ? `: ${courseName}` : ""}`,
    html: wrapEmail({
      title: "We have a date for you",
      preheader: dates || "Confirm whether it works.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(`We can run <b>${courseName || "your training"}</b>${dates ? ` on <b>${dates}</b>` : ""}.`) +
        p("Let us know whether that works and we will hold it."),
      cta: href ? { label: "Confirm the date", href } : null,
    }),
  };
}

export function trainingConfirmed({ firstName, courseName, dates, venue, href }) {
  return {
    subject: `You are confirmed: ${courseName || "ADLM training"}`,
    html: wrapEmail({
      title: "You are confirmed",
      preheader: [dates, venue].filter(Boolean).join(" · ") || "Details inside.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(`Your place on <b>${courseName || "the training"}</b> is confirmed.`) +
        (dates ? p(`<b>When:</b> ${dates}`) : "") +
        (venue ? p(`<b>Where:</b> ${venue}`) : "") +
        p("Bring a laptop that can run the software. We will have everything else."),
      cta: href ? { label: "See the details", href } : null,
    }),
  };
}

/* ══════════════════════════════════════════════════════ the catalogue ══ */

/**
 * Keyed by the same strings as util/emailCatalogue.js, so the Emails screen
 * can show a real preview of any message rather than only the ones somebody
 * has overridden.
 *
 * The sample facts are obviously sample facts — "Sample Ltd", 123456 — so
 * nobody mistakes a preview for a real customer's mail.
 */

/* ── the three security codes ────────────────────────────────────────────────
 *
 * These lived as bare <p> tags inline in routes/auth.js, so the three most
 * security-sensitive messages the studio sends were the only three that did
 * not look like they came from the studio. That is exactly backwards: an
 * unbranded mail asking for a code is what a phishing attempt looks like,
 * and these are the ones a customer most needs to trust.
 *
 * They stay uneditable from the admin — see the catalogue's `why`. A reset
 * mail is the single most useful thing for an attacker to be able to rewrite.
 */

export function passwordResetCode({ firstName, code, minutes = 10 }) {
  return {
    subject: "Your ADLM password reset code",
    html: wrapEmail({
      title: "Password reset code",
      preheader: `Your reset code is ${code}.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p("Use this code to set a new password.") +
        codeBlock(code) +
        p(`It lasts ${minutes} minutes.`),
      footNote:
        "If you did not ask for this, you can ignore it — your password has not changed. " +
        "If it keeps arriving, tell us: somebody is trying to get into your account.",
    }),
  };
}

export function securityCode({ firstName, code, minutes = 10 }) {
  return {
    subject: "Your ADLM security code",
    html: wrapEmail({
      title: "Security code",
      preheader: `Your security code is ${code}.`,
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          "Use this code to confirm something that cannot be undone — deleting projects, or " +
            "locking a contract.",
        ) +
        codeBlock(code) +
        p(`It lasts ${minutes} minutes.`),
      footNote:
        "If you did not ask for this, somebody may have your password. Change it now and tell us.",
    }),
  };
}

export function breakGlassCode({ firstName, code, minutes = 10 }) {
  return {
    subject: "ADLM break-glass sign-in code",
    html: wrapEmail({
      title: "Break-glass sign-in code",
      preheader: "A privileged support sign-in was requested.",
      body:
        p(`Hello ${first(firstName)},`) +
        p("Use this code to complete a break-glass sign-in to the ADLM support account.") +
        codeBlock(code) +
        p(`It lasts ${minutes} minutes.`),
      footNote:
        "If you did not just try to sign in to a privileged ADLM support account, change your " +
        "password immediately and tell the team. This account can reach any customer machine.",
    }),
  };
}


/* ── a marketing message ─────────────────────────────────────────────────────
 *
 * The only kind the studio sends on its own initiative, so the only kind that
 * carries an unsubscribe. Everything above answers something a person just
 * did; this one arrives because somebody decided to write to them.
 *
 * The body is plain text typed by a person in the admin, split on blank lines
 * into paragraphs and ESCAPED. Not HTML: letting an admin paste markup into a
 * mail that goes to every customer means one bad tag renders as garbage in
 * three hundred inboxes, and there is no recall.
 */
export function marketingMessage({
  firstName,
  subject,
  preheader = "",
  heading = "",
  body = "",
  ctaLabel = "",
  ctaHref = "",
  unsubscribeUrl = "",
}) {
  const esc = (t) =>
    String(t ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const paras = String(body)
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => p(esc(t).replace(/\n/g, "<br>")))
    .join("");

  return {
    subject,
    html: wrapMarketingEmail({
      title: subject,
      preheader,
      body:
        p(`Hello ${first(firstName)},`) +
        (heading
          ? `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600">${esc(heading)}</h1>`
          : "") +
        paras,
      cta: ctaHref ? { href: ctaHref, label: ctaLabel || "Have a look" } : null,
      unsubscribeUrl,
    }),
  };
}


/**
 * An order that sat unapproved for too long and has been closed.
 *
 * The tone matters here. Nobody did anything wrong: they placed an order,
 * something did not complete, and fifty days passed. So it does not
 * apologise, does not blame, and does not imply they failed to pay — we do
 * not know that they did not. It says the order is closed, what to do to
 * start again, and how to reach a person if they believe they paid.
 *
 * The steps are numbered because "just order again" is not instructions to
 * somebody who has already had one order go quiet on them.
 */
export function purchaseAutoDeclined({ firstName, ref, what, total, currency, days, href, whatsNewHref }) {
  return {
    subject: "Your ADLM order has been closed",
    html: wrapEmail({
      title: "Your order has been closed",
      preheader: "It was never approved, so it has been closed. Starting again takes a minute.",
      body:
        p(`Hello ${first(firstName)},`) +
        p(
          `Your order${ref ? ` <b>${ref}</b>` : ""}${what ? ` for <b>${what}</b>` : ""} has been ` +
            `open and unapproved for ${days} days, so we have closed it. Nothing was charged by ` +
            `us, and nothing is active on your account from it.`,
        ) +
        (total
          ? p(`<span style="color:#6C819A">The order was for ${money(total, currency)}.</span>`)
          : "") +
        p("<b>If you still want it, this is the whole process:</b>") +
        `<ol style="margin:0 0 14px;padding-left:20px;line-height:1.7">
           <li>Sign in at adlmstudio.net and open <b>Products</b>.</li>
           <li>Choose the product and the number of seats, and add it to your basket.</li>
           <li>Pay by card for an instant licence, or by transfer if you prefer — the bank
               details are on the checkout page.</li>
           <li>Card payments activate straight away. A transfer is approved by hand once we
               can see it, usually the same working day.</li>
         </ol>` +
        p(
          "<b>If you believe you already paid for this order</b>, do not order again — reply to " +
            "this message with the date and the amount and we will find the payment and put the " +
            "licence on your account.",
        ) +
        (whatsNewHref
          ? p(
              `<span style="color:#6C819A">A fair bit has changed since you ordered. ` +
                `<a href="${whatsNewHref}" style="color:#239CFF">What's New</a> lists every ` +
                `release, so you can see what you would be getting now.</span>`,
            )
          : ""),
      cta: href ? { label: "Start again", href } : null,
      footNote:
        "This is an automatic notice about one order. It does not affect any other product on " +
        "your account.",
    }),
  };
}

export const PREVIEW = {
  "auth.password-reset": () => passwordResetCode({ firstName: "Adaeze", code: "123456" }),
  "auth.security-code": () => securityCode({ firstName: "Adaeze", code: "123456" }),
  "auth.break-glass": () => breakGlassCode({ firstName: "Adaeze", code: "123456" }),
  "purchase.auto-declined": () =>
    purchaseAutoDeclined({
      firstName: "Adaeze", ref: "ADLM-0421", what: "QUIV — 1 seat, yearly",
      total: 500000, currency: "NGN", days: 50,
      href: `${SITE}/products`, whatsNewHref: `${SITE}/whats-new`,
    }),
  "account.verify": () => verifyEmail({ firstName: "Adaeze", code: "123456" }),
  "account.welcome": () => welcome({ firstName: "Adaeze" }),
  "billing.invoice": () =>
    invoiceIssued({ firstName: "Adaeze", number: "INV-1042", total: 500000, currency: "NGN", dueOn: "14 September 2026", href: `${SITE}/invoices/sample` }),
  "billing.receipt": () =>
    receipt({ firstName: "Adaeze", number: "RCT-1042", total: 500000, currency: "NGN", paidOn: "1 September 2026" }),
  "billing.renewed": () =>
    renewed({ firstName: "Adaeze", productName: "QUIV", amount: 500000, currency: "NGN", nextOn: "1 September 2027" }),
  "billing.failed": () =>
    paymentFailed({ firstName: "Adaeze", productName: "QUIV", amount: 500000, currency: "NGN", retryOn: "4 September 2026" }),
  "quote.sent": () =>
    quotation({ firstName: "Adaeze", total: 1250000, currency: "NGN", href: `${SITE}/quote/sample`, validUntil: "30 September 2026" }),
  "project.invite": () =>
    projectInvite({ firstName: "Adaeze", invitedBy: "Babajide Gbajumo", projectName: "Lekki Phase 2 Tower", href: `${SITE}/work` }),
  "entitlement.boq-import": () =>
    entitlementGranted({ firstName: "Adaeze", productName: "BoQ Import" }),
  "support.received": () =>
    supportReceived({ firstName: "Adaeze", ref: "TKT-2291", title: "QUIV will not open a 2026 model" }),
  "support.updated": () =>
    supportUpdated({ firstName: "Adaeze", ref: "TKT-2291", message: "We have a build that fixes this — try the installer in your account.", href: `${SITE}/manage/support` }),
  "training.proposed": () =>
    trainingProposed({ firstName: "Adaeze", courseName: "BIM for Building Works", dates: "22–24 September 2026" }),
  "training.confirmed": () =>
    trainingConfirmed({ firstName: "Adaeze", courseName: "BIM for Building Works", dates: "22–24 September 2026", venue: "ADLM Studio, Lagos" }),
};
