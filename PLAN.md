# PLAN: Richard's 16 Sep review (R01 to R22) and his 17 Sep design update

Branch `fix/richard-review-sep16`, cut from `feat/video-notifications` at `dc2ce09`.
Worktree: `C:\Users\ADLM\source\repos\ADLMWebsite-review`. Nothing is merged into main or into the relaunch branch.
Paths are relative to the repo root. `client/` means `client/src/` unless the path says otherwise.

Status: **waiting for approval. No code has been edited.**

---

## 0. What the read-through found

- **The new build is a port of Richard's static site.** The generated files are:
  - `client/src/ds/pages/*` and `client/src/ds/chrome/*`, from `client/scripts/port-ds-html.mjs`.
  - `client/src/styles/ds*.css`, from `client/scripts/port-ds-css.mjs`.
  - Neither is ever hand-edited. Our own CSS goes in `styles/ds-local.css`.
- **Live app screens** are the hand-written `client/src/ds/Ds*.jsx` files, framed by `ds/DsAppShell.jsx` (customer) and `ds/DsAdminShell.jsx` (admin).
- **Rules the brief assumes that don't exist yet:**
  - There is no client test runner, TypeScript check, or feature-flag system.
  - There is no in-app notification model.
  - There is no shared dropdown component. `ds/WkDropdown.jsx` comes closest and is used twice.
  - There is no "square human face" check on profile photos. The only thing close is the hint "JPG or PNG, square works best" (`ds/DsSettings.jsx:425`). See Q3.
- **Brand tokens** (Lexend, `--action`, `--accent`, `--pal-*`) already live in `ds.css`, which is generated. New UI uses only these tokens.

### Richard's 17 Sep update (two commits: `f156e86`, `eaf8bd5`)
I pulled `ADLMWebNewUI` to `eaf8bd5`. It changes 161 files. Several parts are exactly items on this list:

| His change | Covers |
|---|---|
| Guides & docs as its own page (`dash-guides`), with the rail link fixed | R04 |
| Assignments: rail red dot, player tab, bell, `dash-assignments` page | R11, R12, R13 |
| New certificate template (light and dark), name set once with a confirm step, QR code, public `/certificate` verify page | R14 |
| One toast and card feedback system (`feedback.js`) | R08, R13 (confirmation) |
| Ebun's photo on About | R19 |
| Black theme, Appearance setting, softer glows, grey frame outlines, composer signature | His design, adopted as-is |
| My tools rail, project gallery, tool pages, project workspace tabs, RateGen origin, "continue where you left off" | R03, and his projects restructure (see P0.4) |

The porters cannot re-run as they stand:
- `RAIL_EDITS` in `port-ds-html.mjs:563` looks for rail text that no longer exists, so it throws.
- `dsRoutes.js` `MAP` has no entries for `work-tool`, `dash-assignments`, `dash-guides` or `certificate`.
- The CSS porter doesn't know three new sheets: `cert.css`, `feedback.css`, `work-proj.css`.
- The CSS porter drops `@font-face`, so the BALLW certificate font needs a hand-written rule.

So **phase P0 goes first**. Every R-item after it builds on his regenerated markup.

---

## P0: Bring in Richard's 17 Sep update (commits prefixed `P0.n:`)

| # | Work | Files |
|---|---|---|
| P0.1 | **Porter sync.** Add `cert.css`, `feedback.css` and `work-proj.css` to `SHEETS`. Rewrite `RAIL_EDITS` for his new rail. Add `work-tool`, `dash-assignments`, `dash-guides` and `certificate` to `MAP` and `PAGES`. Keep `<a download>` and `/docs/`, `/ds/` paths as plain anchors, not Links: this fixes the Learn "Download" bug that goes to the not-found page. Resolve `data-doc` through `resolveHref`. Re-run the porters and verify. Copy the new images. | `client/scripts/port-ds-css.mjs`, `port-ds-html.mjs`, `lib/html-to-jsx.mjs`, `lib/dsRoutes.js`, regenerated `ds/pages/*`, `ds/chrome/*`, `styles/ds*.css`, `client/public/ds/*` |
| P0.2 | **Black theme.** `ThemeProvider` gains `black`, painted as `.dark` plus `data-shade="black"`. His four-option theme menu goes on `#tt` in the marketing nav and the app bar. An Appearance panel goes in Settings. The pre-paint script gets the same change. | `theme.jsx`, `ds/useDsBehaviours.js`, `ds/DsAppShell.jsx`, `ds/DsAdminShell.jsx`, `ds/DsSettings.jsx`, `client/index.html` |
| P0.3 | **Feedback system.** A React `useFeedback()` with `toast`, `card` and `busy`, rendered with his `feedback.css` classes. It is wired into the forms, downloads and saves he lists. | new `ds/feedback/FeedbackProvider.jsx`, `main.jsx`, the call sites |
| P0.4 | **Projects restructure, visual layer on our data.** Rail: My tools (QUIV, HERON, RateGen, Revit MEP greyed with a promo, CIVIQ "Soon"). Gallery with grid or list, search, source and stage filters, and sort. Tool pages at `/work/tool/:t`. RateGen origin filter and a "From <project>" badge. "Continue where you left off" (tab and line). Workspace tabs on the existing project view. Parts that need data we don't have are listed in Q1. | `ds/DsWorkProjects.jsx`, new `ds/DsWorkTool.jsx`, `ds/DsWorkLibrary.jsx`, `ds/DsWorkHome.jsx`, `features/projects/ProjectOpenView.jsx`, `main.jsx` |
| P0.5 | **Composer signature** (Dolapo's / blank line / none; only on ADLM paper). | `ds/DsDocComposer.jsx`, `lib/adlmDoc.js`, `client/public/ds/sig-dolapo.png` |

The glows, frame outlines and About photo arrive through P0.1 with no extra work.

---

## Navigation and structure

**R01. Legacy routes.**
- Repoint the live new screens off the classic pages:
  - `/purchase` → `/manage/billing` or checkout
  - `/products` → `/manage/products`
  - `/profile` → `/manage/settings`
  - `/support` and `/support/request` → `/manage/support`
  - `/learn` → `/dash-learning` or the Learn filter
  - `/rategen` → `/work/library`
- Redirect the retired URLs: `/profile`, `/freebies` (→ Learn filter), `/trainings*` (see R02). `/purchase` and `/products` are still real checkout and catalogue pages, so they stay.
- Remove the duplicate `admin/follow-ups` route.
- Fix the rail's "Sign out" (today it only links to `/`). Fix "Leaving the studio" pointing at the staff-only `/preview/*` path.
- Replace the "Valuations `href=#`" placeholder with his new rail from P0.1.
- Wire or remove the top-bar search input, which has no handler.

Files: `ds/DsManageOverview.jsx`, `DsBilling.jsx`, `DsTeam.jsx`, `DsProducts.jsx`, `DsDownloads.jsx`, `DsSettings.jsx`, `DsSupport.jsx`, `DsWorkHome.jsx`, `DsWorkLibrary.jsx`, `DsWorkRate.jsx`, `DsLearning.jsx`, `DsCertificates.jsx`, `DsLeaveStudio.jsx`, `DsAppShell.jsx`, `main.jsx`.

**R02. One Learn page.**
- Promote his Learn page (`ds/custom/DsLearn.jsx` with `DsFreeLibrary`) to `/learn`, replacing classic `pages/Learn.jsx`.
- Filter state lives in the URL: `?type=video|course|tutorial&product=…&level=…`. Sources:
  - videos from `/learn/free/sections`
  - courses from `/learn/courses`
  - trainings and events from `/trainings`
  - tutorials from `data/guides.js`
- Products and Trainings link into the filtered Learn page instead of repeating the content (`DsRecommendedVideos` keeps a short list plus "See all in Learn").
- Redirects:
  - `/trainings` → `/learn?type=course`
  - `/trainings/:id` stays (the detail and enrolment flow)
  - `/freebies` → `/learn?type=video`
  - `#free-<slug>` → `?product=`
- Update the nav and footer anchors, the SSR path list and the sitemap.
- Level: courses have no level field today. It is read if present and `TODO(adlm)` otherwise (Q6).

Files: `main.jsx`, `routes.marketing.jsx`, `lib/dsRoutes.js`, `lib/ssrPaths.js`, `scripts/gen-sitemap.mjs`, `ds/custom/DsLearn.jsx`, new `ds/learn/learnFilters.js`, `ds/DsFreeLibrary.jsx`, `components/Nav.jsx`.

**R03. Navigation at a glance.**
- New `ds/railConfig.js`: one array (group, label, to, page, icon, badge, state) that holds his 17 Sep rail.
- `DsAppShell` renders the rail from that array using his classes (`.dsh-nav`, `.dsh-grp`, `.dsh-sub`, `.dsh-tools`), instead of the generated `DsRail.jsx`.
- `/manage` and `/work` each get a visible section grid (his `.dsh-stats` and card pieces) that links every section. The rail keeps primary and secondary items only.
- Richard's redesign can restyle the config's output without touching logic.

Files: new `ds/railConfig.js`, `ds/DsAppShell.jsx`, `ds/DsManageOverview.jsx`, `ds/DsWorkHome.jsx`.

**R04. Sidebar active state and the Download redirect.**
- The active item is the rail item whose `to` exactly matches the current path. Children match on an exact path plus the listed query key, e.g. `/work/tool/quiv`.
- There is no prefix match and no stored state. The `page` prop maps to an item id only as an alias:
  - `dash-course` → My learning
  - `work-rate` → RateGen
- Guides gets its own page (`/manage/guides`, his `dash-guides`). Downloads keeps installers only.
- The logo stops getting `.on`.
- The documents "Download" fix is in P0.1 (plain anchor with `download`).
- `DsDownloads` Guides panel: replaced by a link to Guides.

Files: `ds/railConfig.js`, new `lib/railActive.js`, `ds/DsAppShell.jsx`, new `ds/DsGuides.jsx`, new `pages/ManageGuides.jsx`, `ds/DsDownloads.jsx`, `main.jsx`.

Tests: `lib/railActive.test.js` checks that only one item is active on `/manage/downloads` and `/manage/guides`, that the query-keyed tools are exclusive, and that the aliases resolve.

## UI bugs

**R05. Dropdowns.**
- New shared `ds/useDismiss.js` closes on outside pointerdown, on Escape, and when another dropdown opens (a module-level "one open at a time" registry).
- `WkDropdown` uses it. So do the `DsAppShell` account menu (which today has no outside-click close), the `DsAdminShell` account menu, his new theme menu, and the My tools fold.
- The marketing mega-panel (`useDsBehaviours.initNavPanel`) gains outside-click close and joins the registry.

Tests: `ds/useDismiss.test.jsx` covers outside click, Escape, and one-open-at-a-time.

**R06. Sticky and scroll.** All changes in `styles/ds-local.css`:
- `.lx-side`: `top: calc(var(--dash-bar) + 14px)`, plus `max-height` and `overflow:auto` so a long module list scrolls.
- `.adm-view`: offset checked against the admin bar.
- `scroll-margin-top: calc(var(--dash-bar) + 16px)` on anchor targets inside `.dsh-main`.
- `CouponBanner`: moved inside the shell, so the 100dvh frame stops scrolling the window.
- Checked at 375, 768 and 1280 px, light and dark.

Files: `styles/ds-local.css`, `App.jsx`, `ds/DsAppShell.jsx`.

**R07. Overview.**
- Work tiles use `<p className="ds-sub">` like `/manage` and his design, so they match in size and padding. The 4-column grid has no empty slot.
- The `/manage` "Products active" subtitle is clamped.
- New "Learning history" panel on `/manage`: recent courses from `/me/courses` (progress %) and recent videos from `/me/free-lessons?limit=5` (last watched, opens). Only existing data is used. Video progress is dwell time, so it is shown as "last watched", not a %.

Files: `ds/DsWorkHome.jsx`, `DsWorkProgramme.jsx`, `DsWorkProject.jsx`, `DsManageOverview.jsx`, new `ds/DsLearningHistory.jsx`.

**R08. Profile settings.**
- Audit `ds/DsSettings.jsx` against `GET` and `POST /me/profile`.
- Reload after save and show field-level validation messages, including the server's 409, 400 and 403 texts. Messages go through P0.3 toasts.
- Photo check, which doesn't exist yet (Q3):
  - Client: reject anything that isn't square (±2%) or is under 200px, with an explicit message.
  - Server: repeat the square check on the uploaded image before saving `avatarUrl`.
  - Face detection: see Q3.
- The classic `pages/Profile.jsx` redirects to `/manage/settings` (R01).

Files: `ds/DsSettings.jsx`, `lib/uploadImage.js`, `server/routes/me.js`, new `server/util/avatarCheck.js` (with a test).

**R09. Client logos.**
- The home strip is text only today (`DsHome.jsx:112`, generated).
- Plan: a `ds/DsLogoStrip.jsx` override, fed by `data/clientLogos.js`, with the same height, greyscale that turns to colour on hover, and a `-dark` variant when one exists. Files go in `client/public/ds/logos/`.
- Organisations: NIQS, The Big 5 Construct, NIOB, Federal Airports Authority of Nigeria, Construworth, ITB Nigeria, BEC Associates, JABU, Godaret Consultant, Rivers State University.
- Fetching the official files from their websites is a file download, so it needs your OK (Q4). Otherwise I list the file names for you to drop in.

## Videos

**R10. YouTube categories.**
- The mapping already lives in one file: `server/util/freeVideoSections.js`.
- The catalogue is `server/data/youtube-free-videos.json`, 105 videos, filed by hand. Only 1 video is in Getting started. "Getting Started with the ADLM PlanSwift Plugin" is filed under HERON.
- Plan: add a `PLAYLIST_RULES` and title-rule table to the same file.
  - Starter titles ("getting started", "introduction", "install", "first project") go to `getting-started`.
  - Everything else maps by playlist.
  - A hand-set `section` in the JSON still wins.
- The sync script applies the rules. `DsFreeLessons.jsx`'s duplicate `MATCH` table is removed.
- A dry run is reported before any `--publish`.

Files: `server/util/freeVideoSections.js` (+ its test), `server/util/youtubeLibrary.js`, `server/scripts/sync-youtube-free-videos.mjs`, `client/src/ds/DsFreeLessons.jsx`.

## Assignments and certificates

**R11. Assignment alerts.**
- New `server/models/Notification.js` (user, kind, ref, title, dueAt, seenAt).
- A scheduled job, or a check when the user loads the page, creates notices for:
  - due within 48h
  - overdue
  - result available
- Grading creates the "result available" notice.
- `GET /me/alerts` and `POST /me/alerts/:id/seen`. The name avoids the existing `/me/notifications`, which holds email preferences.
- `/me/rail` gains an `assignments` count.
- Client:
  - a red dot on the Assignments rail item (via `railConfig` badge) and on the player's Assignments tab
  - bell items in the app bar, from his design
  - the badge clears when the learner opens the item

Files: `server/models/Notification.js`, `server/util/assignmentAlerts.js` (+ test), `server/routes/me.js`, `server/routes/adminCourseGrading.js`, `ds/DsAppShell.jsx`, new `ds/DsAssignments.jsx`, `pages/CourseDetail.jsx`.

Test: `assignmentAlerts.test.js` covers the 48h window, overdue, result, and seen clears.

**R12. Assignment uploads.**
- Today `POST /me/media/sign` refuses anything that isn't an image and files everything under `adlm/avatars`. That is the bug.
- New learner route `POST /me/courses/:sku/submission-upload`:
  - returns an R2 presigned PUT (`utils/r2Upload.createPresignedPutUrl`)
  - per-user key
  - allowed types: PDF, DOCX, XLSX, JPG, PNG, WEBP (checked by extension and MIME)
  - size cap 25 MB (Q5)
- `POST /me/courses/:sku/submit` checks the URL is ours and stores the file name, size and type.
- The client checks the same list, using `accept=` and a pre-check.
- One shared rules module is used by both sides.

Files: `server/util/submissionFiles.js` (+ test), `server/routes/meCourses.js`, `server/models/CourseSubmission.js`, `pages/CourseDetail.jsx`, `ds/DsAssignments.jsx`, `client/src/lib/submissionFiles.js`.

Test: `submissionFiles.test.js` covers the allowed and refused types and the size limit.

**R13. Submission feedback.**
- `CourseSubmission` gains `fileName`, `fileSize`, `fileType`, `score` (0 to 100, optional), `feedbackSeenAt`, and `feedback` (already present).
- Grading accepts the score.
- The learner sees a feedback block (grade, comments, who, when) in the player and on `/dash-assignments`.
- After submitting, a confirmation modal built from `WkModal` shows the file name, time and next step. Marked `TODO(adlm)` for Richard's modal design.
- Also fixes the admin queue: `requirePermission("learn")` staff are currently refused at grading, which is `requireAdmin`.

Files: `CourseSubmission.js`, `adminCourseGrading.js`, `meCourses.js`, `DsAdminSubmissions.jsx`, `CourseDetail.jsx`, `DsAssignments.jsx`.

**R14. Certificates.**
- Adopt his template: `cert-light.jpg` and `cert-dark.jpg` from P0.1, and his `cert.css`.
- Learner flow, in his three steps: name once with a live preview → tick "this is final" → choose light or dark.
- The existing lock (`/me/certificate-name`) stays. A finish (`certificateFinish` on the enrollment) is added and can change at any time.
- PDF: `lib/generateCertificatePdf.js` draws on the chosen finish with a QR code (`qrcode.react` is already a dependency).
- Admin "Reset certificate name": `POST /admin/people/:id/certificate-name/reset` (audited), plus a button in `DsAdminPeople`.
- Fix the reference mismatch:
  - learners get the stored `CERT-…` ref
  - auto-issue sets one
  - a public `/certificate?ref=` page calls the existing `GET /verify/:ref` and shows his Verified, Withdrawn or Not found states
- `CertificateNameModal`'s hard-coded light Tailwind is replaced with ds tokens.
- `TODO(adlm)`: BALLW font licence, and a slot for any later design file.

Files: `ds/DsCertificates.jsx`, `ds/LxCertTicket.jsx`, `components/CertificateNameModal.jsx`, `lib/generateCertificatePdf.js`, `server/routes/meCourses.js`, `server/routes/adminCourseGrading.js`, `server/routes/admin.people.js`, `server/models/CourseEnrollment.js`, new `ds/DsCertificateVerify.jsx`, `main.jsx`.

Tests: `server/util/certificateRef.test.js` (one format, verifiable) and a test that the admin reset clears the lock.

## Downloads and apps

**R15. Direct downloads.**
- The Android Drive link is hard-coded as a fallback in `Footer.jsx:7` and `Home.jsx:81`. The desktop Installer Hub URL comes from the `installerHubUrl` setting, which may itself be a Drive link.
- New `GET /downloads/android` (public; the APK isn't licensed) and `GET /me/downloads/installer-hub` (signed in). Each returns a short-lived R2 signed URL, or 302s to one.
- Drive fallbacks are removed.
- Files you upload, listed in the report:
  - `installers/ADLM-Installer-Hub-Setup.exe`
  - `apps/adlm-android.apk`
  - (optional) checksums
- `TODO(adlm)`: bucket name if not `R2_INSTALLERS_BUCKET`.

Files: new `server/routes/downloads.js`, `server/routes/me.js`, `server/index.js`, `client/components/Footer.jsx`, `pages/Home.jsx`, `ds/DsDownloads.jsx`.

**R16. Download audit.** This is a report, not a feature. So far:
- No automatic downloads.
- The BoQ template is click-only, for signed-in and entitled users.
- Installers are click-only for signed-in users.

Two exceptions, fixed here:
- the public `GET /settings/force-reinstall` leaks `installerHubUrl` (fix: send only a flag, fetch the URL signed-in)
- package URIs are unsigned when `R2_INSTALLERS_BUCKET` is unset (reported; an environment issue)

Also reported: `PmTracker.jsx:627` puts the access token in a query string, and `public/boq-template.xlsx` is referenced but missing. No files deleted.

## Assistant UI

**R17. Ada chat.**
- A small safe renderer (React elements, no `dangerouslySetInnerHTML`, no new dependency) for bold, italics, bullet and numbered lists, line breaks, tables and links. Stray `*` never shows, which honours your earlier "remove the asterisks" rule.
- The server prompt allows light Markdown again.
- Suggestion buttons sit under the input at all times: Products, Trainings, Software downloads, Material quantities (e.g. "How many bags of cement for…"). Complete queries send; open ones prefill.
- Also used by `WorkAreaView`.

Files: new `lib/chatMarkdown.jsx` (+ test), `components/AiAgent.jsx`, `server/services/salesAgent.js`, `features/projects/WorkAreaView.jsx`.

## Content and launch

**R18. Market fit section.** New `data/marketFit.js`, holding the question and answer structure (situations, experience, location, budget bands, product mapping) with `TODO(adlm)` placeholders. `ds/DsFit.jsx` reads from it. Which section this means: see Q7.

**R19. Team page.**
- Ebun's photo arrives with P0.1. That fills the third slot.
- The ported About goes live at `/about` (the classic page is live today).
- Etti's card gets a photo slot with the initials as placeholder and `TODO(adlm)`, only if you meant the fourth card (Q8).

**R20. Launch countdown.**
- New `config/launch.js`: `LAUNCH_AT = "2026-10-XXT10:00:00+01:00"` (WAT), marked `TODO(adlm)`.
- New `ds/DsLaunchCountdown.jsx`, built from his `#bb-count` pieces. It ticks every second and unmounts itself once the time passes.
- Placed on the marketing home under the hero (Q9).

**R21. Beyond BIM and the training calendar.**
- New `config/flags.js` (build-time, `import.meta.env.VITE_FLAG_*`, default off): `BEYOND_BIM_LIVE`, `TRAINING_CALENDAR_LIVE`.
- `/beyondbim`, `/beyondbim/register` and `/learn/calendar` are real public routes on our site.
- With the flag off, each shows a "Coming soon" state built from his pieces. With it on, the full page (Beyond BIM is ported already; the calendar uses his events section with `/trainings` data).

Files: `config/flags.js`, `main.jsx`, `routes.marketing.jsx`, new `ds/DsComingSoon.jsx`, new `ds/DsTrainingCalendar.jsx`.

## Payments

**R22. Pending gateway.** Paystack is live in production today. See Q2 before this item.
- Plan:
  - a gateway adapter interface in `server/util/payments/`
  - a new adapter for `[gateway name]`, `TODO(adlm)`, behind the server flag `PAYMENTS_<GATEWAY>_ENABLED` (default off)
  - keys read only from environment variables, listed in `.env.example` with no values
- `GET /settings/payments` exposes only on/off.
- While no gateway is enabled, `DsBilling` and the checkout show a "Payments opening soon" state. Invoices stay readable.
- Auth config, keys, secrets and production config are not touched.

---

## Tests and checks
- Client: add `vitest`, `@testing-library/react` and `jsdom` as dev dependencies, plus `npm test`. Tests for R04, R05, R14 (UI) and R17.
- Server: `node --test` for R11, R12, R14, R08, R10.
- Lint: `npm run lint`. There is no TypeScript check in this repo, so the report will say so rather than add one.
- Each item: build, lint, and check in the browser at 375, 768 and 1280 px in light, dark and black, on live data, view-only.

## Order
P0.1 → P0.2 → P0.3 → R04 → R03 → R05 → R01 → R02 → R06 → R07 → R08 → R11 → R12 → R13 → R14 → R15 → R16 → R17 → R10 → R09 → R18 → R19 → R20 → R21 → R22 → P0.4 → P0.5.

One commit per item (`R05: close dropdowns on outside click`).

## Open questions (need your answer before those items)
1. **P0.4 projects restructure.** His workspace assumes data we don't store: six stages, three IFC model versions with drift review, "switch source", approve-only collaborators, and project rate copies. Should I port only the visuals onto existing data (with those parts shown as "coming soon"), or also build the data? The brief says no new features, so I plan visuals only.
2. **R22.** Paystack is live. Does "payments opening soon" mean the relaunch turns Paystack off until the new gateway is approved? And which gateway? My plan leaves Paystack running and only shows "opening soon" when no gateway is enabled.
3. **R08.** No face check exists today. Is a square check (client and server) plus the browser's FaceDetector, where supported, enough? Or do you want server face detection (AWS Rekognition, paid per image)?
4. **R09.** May I download the ten organisations' official logo files from their websites? If not, name the folder you'll drop them in (I suggest `client/public/ds/logos/`).
5. **R12.** Is 25 MB right as the upload size limit?
6. **R02.** Should courses get a `level` field, or is level `TODO(adlm)` for now?
7. **R18.** Is "market fit" the `/fit` product finder, or the "Not sure which" picker on the Products page?
8. **R19.** Third member is Ebun (his new photo covers it). Did you mean Etti's card instead?
9. **R20.** Where should the countdown show: home hero only, or site-wide as a strip?

## Decisions (your answers, 17 Sep)
- **Brand colours (18 Sep):** Richard's tokens win: navy `#091E39`, blue `#239CFF`, orange `#E86A27`, taken from the logo SVG. These replace the brief's #0D2240 / #1E6BCC / #F07020 / #40B0E0. They already live in the generated `ds.css`; new UI uses only those tokens.
- **P0.4:** port his design onto our real data. His build runs only on demo data.
- **R22:** Paystack stays. It is working, and it is on your personal account while the business account is being set up.
  - The relaunch keeps two ways to pay: card (Paystack) and transfer or invoice (already built).
  - The switch to the ADLM business Paystack account sits behind a flag, with its own env var names, off by default. There is no "payments opening soon" state, because payments are open.
  - `TODO(adlm)`: business account keys when the conversion goes through.
- **R15, widened:** every download is served from ADLM's own storage. Drive links go everywhere they appear, not only for the installer and Android app.
- **R09:** fetch the official logos into a staging folder the site doesn't use, and show them to you for approval before any go live. Legal note given in chat. The fetch waits for your go-ahead.
- **R12:** size limit from our real storage.
  - Learner uploads go browser → Cloudflare R2 by presigned PUT, never through the Lambda (6 MB request cap).
  - R2's single-upload ceiling is 5 GiB. That is the hard server limit, set from one config value.
  - Our AWS account holds no website upload bucket; `adlm-course-archive` and `adlm-course-delivery` are course video.
- **R02:** the free YouTube library lives *inside* his "Watch the whole library" lessons section.
  - His cards, his filter chips (All, Revit, PlanSwift, Rates, Getting started), and "Show more lessons".
  - No spill-over shelves below it and no blank gap.
  - Auto-update: a scheduled job reads the channel's public upload feed (YouTube RSS, no API key). New uploads are filed by the R10 rules and appear on their own.
  - `/learn#guides` lands on the guides section.
- **R08:** the preview's profile-photo error is found.
  - The photo save resends the whole form, including an empty `state`. The server answers 400 "Invalid state", or 403 if the certificate name is locked.
  - Fix: the photo saves on its own, and an empty `state` means "leave unchanged".
  - Face check: square check on client and server plus the browser's FaceDetector where available (default; you didn't say otherwise).
- **R18 `/fit`:** on hold until Richard's redesign.
- **R20:** site-wide strip.
- **Guides:** our four PDFs are the 12 Sep editions from ADLMInstallerHub/Docs, newer than his 1 Sep copies. Ours are kept.
- **R02 level** stays `TODO(adlm)`. **R19:** Ebun's photo (his update) fills the third slot.

## Reported after the plan (17 Sep)
- **No Google or Microsoft sign-in on the preview.**
  - His login and signup pages have both buttons. Our port already renders them through `components/SocialSignIn.jsx` (`ds/pages/DsLogin.jsx:9`, `DsSignup.jsx`).
  - The component draws only the providers the API says are configured. Live `GET https://api.adlmstudio.net/auth/providers` returns `google:false, microsoft:false`, so nothing is drawn.
  - The code is built (2026-08-19). The client IDs were never set.
  - Needs from you: `TODO(adlm)`
    - `GOOGLE_CLIENT_ID`, from Google Cloud Console → OAuth client (Web).
    - `MICROSOFT_CLIENT_ID`, plus optional `MICROSOFT_TENANT`, from Entra ID → App registration (SPA).
    - Both go in SSM `/adlm/cloud/prod`. Authorised origins must include `https://adlmstudio.net`, `https://www.adlmstudio.net` and `https://preview.adlmstudio.net`.
  - This is auth configuration, so I won't touch it. Once the IDs exist, the buttons appear with no code change.
  - Social accounts must set a password before the Windows plugins will accept them. That flow already exists.

## TODO(adlm) so far
- Google and Microsoft client IDs in SSM (social sign-in, above)
- the exact launch time (R20)
- gateway name and env var names (R22)
- the certificate design slot and BALLW font licence (R14)
- Richard's modal design (R13)
- the installer and APK files (R15)
- the logo files (R09)
- the market-fit placeholders (R18)
- course levels (R02)
- Etti's photo (R19)
