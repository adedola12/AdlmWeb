# Break-glass "God" support account + Support tickets

This document describes the privileged support account and the **two-step login
contract** the desktop plugins (QUIV / Heron / MEP, etc.) must implement.

## What the God account is

A tightly-controlled super-admin used by the ADLM technical team to sign in on
**any machine**, with **any ADLM product**, bypassing device/seat/entitlement
binding — so we can reproduce and fix user issues. It is:

- **Full web admin** (super-admin role → every admin area).
- **Device/entitlement-bypassed** on plugin login (any PC, any product).
- **OTP-gated** on every login (email code) **and** re-confirms the password.
- **Fully audited** (every login + every mutating request → `AuditLog`).

## Activation requires TWO things (kill switch)

God powers only turn on when **both** are true:

1. `user.isGod === true` in the database (set via **Admin → Audit Log → Grant God**).
2. The email is listed in the **`GOD_ACCOUNT_EMAILS`** server env var
   (comma-separated), and the server has been redeployed.

Remove the email from `GOD_ACCOUNT_EMAILS` (or revoke the flag / disable the
account) to instantly and completely revoke access.

### Server env vars

```
GOD_ACCOUNT_EMAILS=support@adlmstudio.net,founder@adlmstudio.net
# Optional: where new support tickets are emailed (falls back to ADMIN_EMAIL,
# then admin@adlmstudio.net)
SUPPORT_NOTIFY_EMAIL=support@adlmstudio.net
```

Email sending reuses the existing Resend/SMTP `sendMail` infrastructure — no new
mail config needed.

---

## Login contract (server → plugin)

Normal users are **unaffected** — login behaves exactly as today and never
returns `otpRequired`. Only God accounts trigger the two-step flow.

### Step 1 — `POST /auth/login` (unchanged request)

Send the same body as today (plugin login):

```json
{ "identifier": "support@adlmstudio.net", "password": "…", "productKey": "revit", "device_fingerprint": "…" }
```
with header `x-adlm-client: win|plugin|desktop` (and optionally `x-adlm-fp-version`).

- **Normal account →** `200 { accessToken, user, licenseToken }` (as today).
- **God account →** `200 { otpRequired: true, challenge: "<jwt>", method: "email", hint: "su***@adlmstudio.net" }`
  and a 6-digit code is emailed. **No tokens are returned yet.**

The plugin must detect `otpRequired === true` and show a screen that asks for:
the **emailed 6-digit code** and the **password again**.

### Step 2 — `POST /auth/login/otp`

```json
{ "challenge": "<jwt from step 1>", "code": "123456", "password": "<password again>" }
```

- **Success →** `200 { accessToken, user, licenseToken }` — identical shape to a
  normal successful login. `licenseToken` is a valid, device-bypassed license
  for the `productKey`/`device_fingerprint` carried in the challenge.
- **Failure codes:** `CHALLENGE_EXPIRED` (401, restart from step 1),
  `OTP_INVALID` (400, wrong/expired code), `OTP_LOCKED` (429, >5 attempts,
  restart), `LICENSE_TOKEN_UNAVAILABLE` (503).

The challenge JWT (scope `god_login`, 10-min TTL) already carries the plugin
context (`plugin`, `productKey`, `fingerprint`, `fpVersion`), so step 2 needs no
device fields — just the challenge, code, and password.

### What the plugin does NOT need to change

The device/seat/entitlement **bypass is entirely server-side**. Once step 2
returns the `licenseToken`, the plugin treats it like any normal license token.
No fingerprint/seat logic changes are required on the desktop.

---

## Server implementation (this repo)

- `server/util/godAccount.js` — `isGodUser` (DB flag **AND** env allowlist).
- `server/routes/auth.js` — `/login` short-circuits God accounts to the OTP
  challenge; `/login/otp` verifies code + password and mints a synthetic license
  (`mintGodLicense`, in-memory only — never writes to real entitlements).
- `server/middleware/requireEntitlement.js` — God bypasses entitlement checks.
- `server/middleware/auditGod.js` — logs every mutating God request.
- `server/models/AuditLog.js`, `server/util/audit.js` — the audit trail.
- Admin: `server/routes/admin.audit.js` (`/admin/audit-log`) — read logs, grant/
  revoke God. Gated by the admin-exclusive `audit` permission area.

## Support tickets (web only)

- User raises a ticket at `/support/request` (issue + AnyDesk address); past
  tickets show status/schedule.
- Admin triages at **Admin → Support Tickets** (`/admin/support-tickets`):
  status workflow (`open → scheduled → in-progress → resolved → closed`),
  schedule date, internal notes, AnyDesk address, delete. Gated by the
  staff-grantable `support` area. Email notifications on submit + status change.
- Server: `server/models/SupportTicket.js`, `server/routes/support.js`
  (`/api/support`), `server/routes/admin.support.js` (`/admin/support-tickets`).

### Raising a ticket from any ADLM software (plugins)

`POST /api/support/tickets` is reusable by the website **and** every desktop
plugin — it only needs a valid Bearer access token (the same one the plugin
already obtains at login). Body:

```json
{
  "title": "Crash on export",
  "description": "Steps…",
  "anyDeskAddress": "1 234 567 890",
  "category": "technical",
  "productKey": "revit",
  "source": "revit-plugin",
  "appVersion": "3.4.1"
}
```

`source`/`appVersion` are optional — if omitted, `source` falls back to
`productKey`, then the `x-adlm-client` header, then `"web"`; `appVersion` can
also come from an `x-adlm-app-version` header. The admin ticket view and the
team notification email show which software raised each ticket.
