// Every message the studio sends, declared once.
//
// His Emails screen calls these "the messages the studio sends without anybody
// pressing anything". Ours is a longer list than his nine because some of ours
// are sent BY somebody — an admin issues a receipt, replies to a ticket — and
// those belong here too: the question the screen answers is "what does a
// customer receive from us, and what does it say", and who pressed the button
// does not change that.
//
// This file is the register. It does not send anything; it names what exists,
// where the wording lives, and whether it may be edited from the admin.
//
// KEEPING IT HONEST
//
// `file` is checked by the route: if a message here names a file that no
// longer sends it, the screen says so rather than listing a message that is no
// longer real. A register that quietly drifts from the code is worse than no
// register, because people trust it.

/**
 * editable:false means the wording cannot be overridden from the admin.
 *
 * Only the security codes carry it, and the reason is not technical. Their
 * wording is what a person reads before typing a code into a box, so an admin
 * account that can rewrite it is an admin account that can write a convincing
 * phishing mail from the studio's own domain. `why` is shown on the screen so
 * the refusal is explained rather than looking like something unfinished.
 */
export const EMAILS = [
  {
    key: "auth.security-code",
    name: "Sign-in security code",
    when: "Somebody signs in from a device we have not seen",
    file: "routes/auth.js",
    editable: false,
    why: "It is what a person reads before typing a code in. Wording stays in code.",
  },
  {
    key: "auth.password-reset",
    name: "Password reset code",
    when: "Somebody asks to reset their password",
    file: "routes/auth.js",
    editable: false,
    why: "Same reason: a reset mail is the most useful thing an attacker could rewrite.",
  },
  {
    key: "auth.break-glass",
    name: "Break-glass sign-in code",
    when: "The support account is used to reach a customer's machine",
    file: "routes/auth.js",
    editable: false,
    why: "The most privileged action on the system announces itself in fixed words.",
  },

  {
    key: "purchase.auto-declined",
    name: "Order closed after 50 days",
    when: "A pending order has gone 50 days without approval",
    file: "util/staleOrders.js",
    editable: true,
    why: "",
  },
  {
    key: "account.verify",
    name: "Confirm your email",
    when: "Somebody signs up, before the account can buy anything",
    file: "util/emailContent.js",
    editable: true,
  },
  {
    key: "account.welcome",
    name: "Welcome",
    when: "An account is created",
    file: "util/emailContent.js",
    editable: true,
  },
  {
    key: "billing.invoice",
    name: "Invoice",
    when: "An admin issues an invoice",
    file: "routes/admin.invoices.js",
    editable: true,
  },
  {
    key: "billing.receipt",
    name: "Receipt",
    when: "An invoice is marked paid",
    file: "routes/admin.invoices.js",
    editable: true,
  },
  {
    key: "billing.renewed",
    name: "Subscription renewed",
    when: "The overnight renewal charges a card successfully",
    file: "util/autoRenew.js",
    editable: true,
  },
  {
    key: "billing.failed",
    name: "A payment did not go through",
    when: "A card is declined on a renewal",
    file: "util/autoRenew.js",
    editable: true,
  },
  {
    key: "quote.sent",
    name: "Quotation",
    when: "A quotation is priced and sent",
    file: "routes/quote.js",
    editable: true,
  },
  {
    key: "support.received",
    name: "Support request received",
    when: "Somebody raises a ticket",
    file: "routes/support.js",
    editable: true,
  },
  {
    key: "support.updated",
    name: "Support request updated",
    when: "An admin replies on a ticket",
    file: "routes/admin.support.js",
    editable: true,
  },
  {
    key: "training.proposed",
    name: "Training date proposed",
    when: "A date is offered for an on-site training",
    file: "routes/admin.js",
    editable: true,
  },
  {
    key: "training.confirmed",
    name: "Training confirmed",
    when: "A booking is confirmed",
    file: "routes/admin.ptrainings.js",
    editable: true,
  },
  {
    key: "project.invite",
    name: "Project invitation",
    when: "Somebody is invited to collaborate on a project",
    file: "routes/me.js",
    editable: true,
  },
  {
    key: "entitlement.boq-import",
    name: "BoQ Import activated",
    when: "An admin grants the BoQ Import entitlement",
    file: "util/boqImportGrantEmail.js",
    editable: true,
  },
];

export const byKey = new Map(EMAILS.map((e) => [e.key, e]));

/** Whether a key names a message at all, and whether it may be rewritten. */
export const canEdit = (key) => !!byKey.get(key)?.editable;
