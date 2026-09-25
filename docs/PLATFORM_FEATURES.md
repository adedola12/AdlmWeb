# ADLM Website — Complete Platform Feature Reference

This is the **whole-platform** feature reference for the ADLM website (client +
server in this repository). It covers everything the site does, from the public
marketing pages through e-commerce/licensing, the learning platform, trainings,
and the quantity-surveying project workspace.

> The QS **project workspace** (module **K** below) is large enough to have its
> own deep-dive document: [`PROJECT_WORKSPACE_FEATURES.md`](./PROJECT_WORKSPACE_FEATURES.md).
> This file is the index to *everything*; that file is the authority on the BOQ /
> rate-gen / contract / valuation / WBS / EVM stack.

The platform is **Naira-native (NGN)** with **USD** support via a configurable FX
rate, and is built around **Nigerian QS practice** (BESMM4, NRM2/SMM7).

---

## Architecture at a glance

| Layer | Stack |
|---|---|
| **Client** | React 19 + Vite 7, React Router 7, Zustand, Tailwind 4, react-icons. Exports via xlsx / jsPDF / pdf-lib / html2canvas / jszip; `qrcode.react`; `canvas-confetti`. |
| **Server** | Node + Express 5 (ESM), Mongoose 8 / MongoDB. Helmet, CORS, morgan, express-rate-limit, cookie-parser. |
| **Auth** | JWT access + refresh-token cookies; roles `user` / `mini_admin` / `admin`; admin-key middleware for sensitive ops. |
| **Payments** | Paystack (NGN + USD), webhooks. |
| **Storage / media** | Cloudinary + AWS S3 (`@aws-sdk/client-s3`, multer). |
| **Email** | Nodemailer (quotes, proposals, enrollments, resets). |
| **AI** | OpenAI (`openai`) — powers HelpBot. |
| **Docs / files** | exceljs + pdfkit (server), xlsx + jsPDF + pdf-lib (client), qrcode. |
| **Jobs** | node-cron scheduled tasks. |

The Express app mounts routes both at bare paths (`/projects`) and `/api/*`
aliases for convenience. See `server/index.js` for the full mount table.

---

## Module map

| # | Module | Public pages | Admin | Key server routes |
|---|---|---|---|---|
| A | Marketing & company site | ✅ | — | `showcase`, `coupons`, `settings.public` |
| B | Accounts, auth & profile | ✅ | — | `auth`, `me` |
| C | E-commerce & licensing | ✅ | ✅ | `products`, `quote`, `purchase`, `entitlements`, `me-deployments`, `webhooks`, `admin.products`, `admin.softwares`, `admin.coupons`, `admin.invoices` |
| D | Learn (LMS) | ✅ | ✅ | `Learn`, `meCourses`, `admin.learn`, `adminCourses`, `adminCourseGrading`, `adminBunny`, `*.classrooms` |
| E | Trainings (online + physical) | ✅ | ✅ | `trainings`, `ptrainings`, `me-trainings`, `me-ptrainings`, `training-locations`, `admin.trainings`, `admin.ptrainings`, `admin.training-locations` |
| F | Freebies | ✅ | ✅ | `freebies`, `admin.freebies` |
| G | Proposals | ✅ (token) | ✅ | `proposals.public`, `admin.proposals` |
| H | HelpBot (AI) | ✅ | ✅ | `helpbot`, `admin.helpbot`, `services/helpbotAI` |
| I | Flyer Engine | — | ✅ | `admin.flyers` |
| J | Model Check / readiness | ✅ (report) | — | `model-checks` |
| K | QS Project Workspace | ✅ (share) | ✅ | `projects`, `projects.boq`, `projects.pm`, `rategen*`, `rates.compute` |
| L | Admin console (cross-cutting) | — | ✅ | `admin`, `admin.settings`, `admin.media`, `admin.migrations`, `admin.usersLite` |
| M | Platform / infra | — | — | `meta.dynamic`, `wellKnown`, `webhooks`, middleware |

---

## A. Marketing & company site

- **Home, About, Testimonials, Support** pages; global **Nav** and **Footer**.
- **Showcase** content served from the DB: `industry-leaders`, partner
  `companies`, `testimonials`, and live `stats` counters (`/showcase/*`).
- **Coupon banner** — a dismissible site-wide promo bar driven by the active
  coupon feed (`/coupons/banner`).
- **YouTube welcome modal** on the homepage with a capped watch duration.
- **HelpBot** assistant mounted on every page (see §H).
- **Public settings** endpoint exposes safe global config (mobile-app URL,
  installer-hub links/video, force-reinstall notice, VAT label) for the client.

## B. Accounts, auth & profile

- **Signup / Login / Logout** with JWT access tokens and refresh-token cookies;
  the `/auth` router is **rate-limited**.
- **Change password** and **password reset** (email token via `PasswordReset`).
- **Profile** page; `/me` returns the user, entitlements, and seat usage.
- **Roles**: `user`, `mini_admin`, `admin` (`requireRole`, `requireAdminKey`,
  `requireAdminOrMiniAdmin`).

## C. E-commerce & licensing

The commercial engine behind the desktop plugins (QUIV / HERON / CIVIQ /
Revit-MEP / RateGen).

- **Product catalog** — `Products` page and `ProductDetail` by `key`
  (`productKey`). Each product carries NGN **and** optional USD pricing across
  **monthly / six-month / yearly** tiers, a one-time **install fee**, optional
  **discounted** price variants, a default billing cadence, and bundle discounts.
- **Quote builder** (`/quote`) — assemble a multi-line quotation, optional VAT
  (when enabled and `vatApplyToQuotes`), emailed to the client.
- **Purchase / checkout** (`/purchase`) — Paystack-backed. USD prefers the
  explicit USD field, otherwise converts NGN at the configured FX rate; the
  discounted variant wins when strictly cheaper. VAT applied per settings.
- **Coupon engine** — percent or fixed-bundle coupons validated and applied at
  checkout (`util/coupons.js`, `admin.coupons`).
- **Orders, Receipts, Invoices** — `me-orders`, user `Receipt` / `UserInvoice`
  pages, and admin invoice management (`admin.invoices`).
- **Entitlements & device binding** (`/api/entitlements`, `/me/deployments`):
  - Each entitlement has a **status** (`active` / `inactive` / `disabled` /
    `expired`), **seats**, a **kind** (`personal` / `organization`), and a list
    of bound **devices**.
  - Devices bind by **fingerprint** with a name, `boundAt` / `lastSeenAt`, and
    **revocation**. Legacy single-device fields auto-migrate into `devices[]`.
  - This is what gates **Save to Cloud** in the plugins — an active entitlement
    for that plugin is required.
  - Expiry pre/post **email reminders** (`lastSentKind`).
- **Software registry** — admin CRUD for software products/versions
  (`admin.softwares`).
- **Force-reinstall** broadcast — a global setting (`forceReinstallActive` +
  message + timestamp) the desktop apps can read.

## D. Learn — LMS

- **Free video library** (`/learn`, paginated) and **free video detail**
  (`/learn/free/:id`).
- **Paid courses** (`/learn/course/:sku`) — `CourseDetail`, enrollment, and
  course videos. Video hosting via **Bunny Stream** (`adminBunny`).
- **My Courses** — the enrolled-course dashboard (`/me/courses`).
- **Submissions & grading** — students submit work (`CourseSubmission`); admins
  **grade submissions** and **mark enrollments complete**
  (`/admin/course-grading/...`).
- **Classrooms** — cohort grouping (`admin.classrooms`, `me.classrooms`).
- Models: `Learn` (FreeVideo / PaidCourseVideo), `PaidCourse`,
  `CourseEnrollment`, `CourseSubmission`.

## E. Trainings (two distinct kinds)

- **Online / standard Trainings** — `/trainings`, `/trainings/:id`, and an
  enrollment flow (`/trainings/enrollment/:enrollmentId`). Models `Training`,
  `TrainingEvent`, `TrainingEnrollment`.
- **Physical Trainings (PTrainings)** — venue-based, with **training
  locations**. `/ptrainings/:key`, `/ptrainings/enrollment/:enrollmentId`.
  Models `PTrainingEvent`, `PTrainingEnrollment`, `TrainingLocation`.
- **My Trainings** dashboards for both (`/me/trainings`, `/me/ptrainings`).
- Admin: `admin.trainings`, `admin.ptrainings`, `admin.training-locations`.

## F. Freebies

- Public **Freebies** page (gated resources/downloads) + admin CRUD
  (`freebies`, `admin.freebies`, model `Freebie`).

## G. Proposals

- **Admin proposal builder** (`AdminProposals`) — auto-numbered
  (`proposalNumber` + `seq`), with product lines, training packages, line
  items, NGN/USD ranges, client details, and a validity date.
- **Server-rendered PDF** via pdfkit (`buildProposalPdfBuffer`).
- **Public viewer** by unguessable `shareToken` (`/proposal/:token`) and
  **public PDF** (`/proposals/:token/pdf`) — no login; internal fields stripped.
- Optional **Notion** sync field on the model.

## H. HelpBot (AI assistant)

- Site-wide chat widget answering platform questions, **grounded** in the live
  catalog: products, paid courses, free videos, and trainings (token-scored
  matching in `routes/helpbot.js`).
- AI layer (`services/helpbotAI.js`) uses **OpenAI** (default `gpt-4o-mini`,
  configurable), gated by `HELPBOT_AI_ENABLED` / `OPENAI_API_KEY`, with a tight
  system prompt (short answers, ADLM-only scope, no invented pricing).
- **Logged** (`HelpBotLog`) and **IP rate-limited**; admin view (`admin.helpbot`).

## I. Flyer Engine

- **Admin flyer generator** (`AdminFlyers`) with templates: `announcement`,
  `countdown`, `launch`, `event`, `subscription`, `ticket`.
- Thumbnails uploaded to **Cloudinary**; a standalone **preview/render** route
  (`/__flyer-preview`) produces the artwork client-side (html2canvas / jsPDF).
- Gated to **admin / mini_admin**. Model `Flyer`.

## J. Model Check / Model Readiness

- The desktop plugins push a **model-readiness check** to the cloud
  (`POST /model-checks`, auth required): `readinessScore` (0–100),
  `overallStatus` (Pass/Fail/Warning), total elements, **missing categories**,
  **overlap/clash count**, a **QS query** string, per-category results
  (count + status), and **rebar analysis** (per host category: total, with-rebar,
  coverage %).
- `modelType` is **Architectural** or **Structural**.
- Viewable as a shareable **Model Check Report** page (`/model-check/:id`).

## K. QS Project Workspace

The cloud quantity-surveying brain behind the takeoff plugins. Full detail in
[`PROJECT_WORKSPACE_FEATURES.md`](./PROJECT_WORKSPACE_FEATURES.md). Summary:

- **Project intake** — **Save to Cloud** (entitlement-gated, version-safe,
  auto-classified by category + trade) and the **Open from Cloud** round-trip via
  a copyable Project ID. One unified `TakeoffProject` model regardless of source
  plugin.
- **Project explorer** + four tabs: **Dashboard**, **Bill of Quantity**,
  **PM Dashboard**, **Valuation**.
- **Bill of Quantities** — spreadsheet-grade priced bill: smart rate cell
  (Excel-style formulas, rate-library search, automatic unit conversion, group
  linking, lock-aware), per-line earned value, category/trade grouping,
  **BESMM4 preliminaries**, PC/provisional sums, contingency + VAT cascade,
  5-step undo, and **formula-driven Excel exports** (Elemental, NRM2 Trade,
  Generic).
- **Rate Generation engine** — built-up unit rates (materials + labour +
  overhead + profit), **master / override / custom** layering with precedence,
  composition guardrails (overstated rates clamped), **price provenance**
  (`priceAsOf`), component Material/Labour/Plant/Consumable tagging, and a live
  effective-rate library + **Rate Updates feed**.
- **Material & Labour schedules** — priced procurement schedule with
  auto-fill/sync from the component catalogue and a **Purchased** tracker.
- **Contract Tracker** — **PIN-locked** frozen baseline; **server-side**
  enforcement diverts post-lock new lines into variations, captures re-measures
  as Actual qty/rate, and re-inserts deleted baseline lines so the contract sum
  cannot silently shrink.
- **Variation Tracker** — manual + automatic (`post-lock-new-item`) change
  orders; counts toward the project total always but as earned value only when
  completed.
- **Interim Valuation & Payment Certificates** — cumulative-less-previous certs
  with **retention / VAT / WHT**, draft → approved → paid lifecycle, immutable
  financials, latest-only deletion, Excel + printable output, and a **Final
  Account** close-out.
- **Project Management / WBS** — costed work breakdown structure; build
  **manually**, **generate from BOQ**, or **import MS Project** (.xml/.mpp);
  **weighted cost↔WBS linking** with link-health chips; summary roll-ups;
  auto-reschedule; BOQ heatmap; `.ics` calendar export.
- **Earned Value Management (EVM)** — BAC / PV / EV / AC / CPI / SPI / EAC / VAC,
  dashboard tiles, budget bar, tasks donut, burndown, WBS health strip, and
  **BOQ↔WBS coverage reconciliation** (flags stale links and double-counting).
- **Progress audit trail** — append-only valuation ledger → daily logs, with
  bi-directional WBS↔BOQ progress propagation.
- **Public client dashboard** — read-only share link
  (`/projects/shared/:token`) re-framing QS numbers in plain language.
- **BIM model attachments** — up to 3 IFC models (Architectural / Structural /
  MEP) in cloud storage.

## L. Admin console (cross-cutting)

A full role-gated admin area:

- **Commerce**: Products (+ edit), Coupons, Invoices, Softwares, Deployments.
- **Content / LMS**: Learn, Courses, Course-grading, Classrooms, Bunny video.
- **Trainings**: Trainings, PTrainings, Training-locations.
- **Marketing**: Showcase, Freebies, Flyers, Proposals.
- **QS**: RateGen master catalogue — materials, labour, rates, library, and the
  compute engine (`admin.rategen*`).
- **Platform**: Settings (FX, VAT toggles, installer/app URLs, force-reinstall,
  founder signature), Media uploads, Users (lite), and one-off **Migrations /
  backfills**.

## M. Platform / infrastructure

- **Settings** service — global config doc (`key: "global"`): `fxRateNGNUSD`,
  VAT (`vatEnabled` / `vatPercent` / `vatLabel` + apply-to flags for purchases /
  quotes / invoices), installer-hub & mobile-app URLs, force-reinstall
  broadcast, founder signature.
- **Media** uploads via multer → Cloudinary / S3.
- **Webhooks** — Paystack payment callbacks.
- **`.well-known`** and **dynamic meta** routes (`meta.dynamic`, `wellKnown`).
- Security/ops: helmet, CORS allow-list, morgan logging, multiple
  **express-rate-limit** tiers (auth, device), node-cron jobs.
- **Email** via nodemailer; **QR codes**; PDF/Excel generation.

---

## Appendix — repository layout

```
client/
  src/
    pages/          # route components (public + admin)
    components/     # Nav, Footer, HelpBot, CouponBanner, modals, common/
    features/       # flyers/, projects/  (feature-scoped UI)
    api/  lib/  utils/  assets/
  (Vite + Tailwind config)

server/
  index.js          # app bootstrap + route mount table
  routes/           # one file per feature area (public + admin.*)
  models/           # Mongoose schemas
  services/         # helpbotAI, pmCompute, rategen.computeEngine
  middleware/       # auth, roles, adminKey, rateLimiter, requireEntitlement
  util/ utils/      # fx, coupons, mailer, etc.
  assets/  scripts/

docs/
  PLATFORM_FEATURES.md            # this file — whole-platform index
  PROJECT_WORKSPACE_FEATURES.md   # deep-dive on the QS workspace (module K)
```

*Reflects the implementation on the current branch. Defaults, enums, and route
mounts are drawn directly from the code (`server/index.js`, models, and route
files).*
