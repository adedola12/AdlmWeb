# CLAUDE.md — ADLM Website

Guidance for Claude Code (and humans) working in this repo. Keep it current.

## What this is

The **ADLM Website**: the cloud platform behind ADLM Studio's desktop takeoff
plugins (QUIV / HERON / CIVIQ / Revit-MEP) and RateGen, plus the public storefront,
learning platform, and trainings. **Naira-native (NGN)** with USD via a
configurable FX rate; built around **Nigerian QS practice** (BESMM4, NRM2/SMM7).

A monorepo with two apps:

- `client/` — React 19 + Vite 7 SPA (React Router 7, Zustand, Tailwind 4).
- `server/` — Express 5 (ESM) + Mongoose/MongoDB API.

## Feature inventory → read the docs

Do **not** re-derive features from scratch — they're documented:

- **`docs/PLATFORM_FEATURES.md`** — the whole-platform reference (every module).
- **`docs/PROJECT_WORKSPACE_FEATURES.md`** — deep dive on the QS workspace
  (BOQ, Rate Gen, Contract Tracker, Variations, Valuation/Certificates, WBS, EVM).

Modules at a glance: (A) marketing site · (B) auth/profile · (C) e-commerce &
licensing/entitlements · (D) LMS (Learn/courses/grading/classrooms) ·
(E) trainings (online + physical) · (F) freebies · (G) proposals ·
(H) HelpBot (OpenAI) · (I) flyer engine · (J) model-readiness check ·
(K) QS project workspace · (L) admin console · (M) settings/infra.

**When you add or materially change a feature, update both docs.**

## Layout

```
client/src/
  pages/        route components (public + admin)  — router defined in main.jsx
  components/   Nav, Footer, HelpBot, CouponBanner, modals, common/
  features/     flyers/, projects/  (feature-scoped UI)
  api/ lib/ utils/ config.js (API_BASE)
server/
  index.js      app bootstrap + the route mount table (start here)
  routes/       one file per feature; admin.* files are role-gated
  models/       Mongoose schemas
  services/     helpbotAI, pmCompute, rategen.computeEngine
  middleware/   auth, roles, adminKey, rateLimiter, requireEntitlement
  util/ utils/  fx, coupons, mailer, …
docs/           the two feature references above
```

## Conventions

- **ESM everywhere** on the server (`"type": "module"`); use `import`.
- Routes are mounted at bare paths **and** `/api/*` aliases (see `index.js`).
- Most JSON responses use the `{ ok, items }` / `{ ok, item }` shape; match the
  neighbouring file when adding endpoints.
- **Roles**: `user` / `mini_admin` / `admin`. Gate admin routes with
  `requireAuth` + `requireRole` / `requireAdminOrMiniAdmin` / admin-key middleware.
- **Entitlements** gate plugin "Save to Cloud" — see `requireEntitlement` and
  `routes/entitlements.js` (status / seats / device fingerprints).
- **Money**: NGN is integer-rounded; USD is `round2`. USD prefers an explicit
  USD field, else converts NGN via `Setting.fxRateNGNUSD`. VAT is settings-driven
  with per-surface apply flags (purchases / quotes / invoices).
- **Secrets** come from env (`OPENAI_API_KEY`, `PAYSTACK_SECRET_KEY`, Cloudinary,
  AWS, mail, `HELPBOT_AI_*`). Never hardcode or commit them.
- Match the surrounding code's style; keep comment density similar.

## Run / build

```bash
# server (from server/)
npm run dev      # nodemon index.js
npm start        # node index.js

# client (from client/)
npm run dev      # vite
npm run build    # vite build
npm run lint     # eslint
```

There is **no test suite** (`server` test script is a placeholder). Verify
changes by running the app.

## Gotchas

- The QS workspace is the most intricate area; its invariants (contract lock
  enforcement, valuation factor, EVM math, WBS weighting) are server-authoritative
  — read `PROJECT_WORKSPACE_FEATURES.md` before touching `projects*`/`rategen*`.
- HelpBot AI is **disabled** unless `HELPBOT_AI_ENABLED=true` and an OpenAI key is
  present; it falls back to catalog keyword matching.
- LMS video is **Bunny Stream** (`adminBunny`); media/IFC uploads go to Cloudinary
  / S3.
