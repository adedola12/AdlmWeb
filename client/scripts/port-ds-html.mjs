// Generate React components from Richard's static pages.
//
// SOURCE   ../ADLMWebNewUI/site/{index.html, src/*.html}
// OUTPUT   client/src/ds/chrome/*.jsx   shared nav, footer, icon sprite, promo band
//          client/src/ds/pages/*.jsx    one component per ported page
//
// His build.js assembles a page as: icon sprite + nav + body + footer, with the
// promo band injected just above the closing CTA. This mirrors that, except the
// chrome becomes components instead of string slices, so it still cannot drift
// between pages.
//
// Re-run with:  node scripts/port-ds-html.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToJsx } from "./lib/html-to-jsx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, "..");
const SITE = path.resolve(CLIENT, "../../ADLMWebNewUI/site");
const OUT_CHROME = path.join(CLIENT, "src/ds/chrome");
const OUT_PAGES = path.join(CLIENT, "src/ds/pages");

// Pages ported so far. Growing this list is the whole job; everything else here
// stays put. `slug` is the /preview/<slug> path the staged page is served at.
//
// Auth, commerce and the dash-*/work-* screens are deliberately absent: those
// routes already exist here with real backends behind them, so they get
// restyled in place rather than replaced by a static prototype.
const PAGES = [
  // core
  { src: "index.html", name: "DsHome", slug: "home" },
  { src: "src/about.html", name: "DsAbout", slug: "about" },
  { src: "src/products.html", name: "DsProducts", slug: "products" },
  { src: "src/pricing.html", name: "DsPricingPage", slug: "pricing-base", internal: true },
  { src: "src/learn.html", name: "DsLearnPage", slug: "learn-base", internal: true },
  { src: "src/whats-new.html", name: "DsWhatsNewPage", slug: "whats-new-base", internal: true },
  { src: "src/customers.html", name: "DsCustomers", slug: "customers" },
  { src: "src/contact.html", name: "DsContact", slug: "contact" },
  { src: "src/how-it-works.html", name: "DsHowItWorks", slug: "how-it-works" },
  // Added upstream 2026-08-18 ("Six products, and a quotation you can price
  // yourself"). The markup ports cleanly; its 346-line calculator in
  // assets/js/quote.js is NOT ported yet, so the page renders but does not
  // compute — see the note in the port output.
  { src: "src/quote.html", name: "DsQuotePage", slug: "quote-base", internal: true },

  // product pages
  { src: "src/quiv.html", name: "DsQuivPage", slug: "quiv-base", internal: true },
  { src: "src/heron.html", name: "DsHeronPage", slug: "heron-base", internal: true },
  { src: "src/rategen.html", name: "DsRateGenPage", slug: "rategen-base", internal: true },
  { src: "src/mep.html", name: "DsMepPage", slug: "mep-base", internal: true },
  { src: "src/timepro.html", name: "DsTimeProPage", slug: "timepro-base", internal: true },
  // His CIVIQ page, generated verbatim except for the PAGE_EDITS above: the
  // price reads from the catalogue and the build roadmap is inserted in his
  // own vocabulary. The wrapper that supplies `d` is src/ds/custom/DsCiviq.jsx.
  // `internal` — generated, but not given a /preview route of its own: it
  // requires the `d` prop, so rendering it bare would throw.
  { src: "src/civiq.html", name: "DsCiviqPage", slug: "civiq-base", internal: true },
  // The companion app keeps its page — it is a real thing we ship, and the
  // footer and home page both link to it — but it is out of the Products menu,
  // because there is no catalogue product and nothing to buy. See NAV_EDITS.
  { src: "src/mobile.html", name: "DsMobile", slug: "mobile" },

  // solutions
  { src: "src/solutions-firms.html", name: "DsSolutionsFirms", slug: "solutions-firms" },
  { src: "src/solutions-professionals.html", name: "DsSolutionsProfessionals", slug: "solutions-professionals" },
  { src: "src/solutions-students.html", name: "DsSolutionsStudents", slug: "solutions-students" },
  { src: "src/solutions-institutions.html", name: "DsSolutionsInstitutions", slug: "solutions-institutions" },

  // company + legal
  { src: "src/careers.html", name: "DsCareers", slug: "careers" },
  { src: "src/press.html", name: "DsPress", slug: "press" },
  { src: "src/privacy.html", name: "DsPrivacy", slug: "privacy" },
  { src: "src/terms.html", name: "DsTerms", slug: "terms" },
  { src: "src/licensing.html", name: "DsLicensing", slug: "licensing" },

  // ── auth + commerce ─────────────────────────────────────────────────────
  // Staged for review only. The real /login, /signup, /purchase and
  // /checkout/thanks keep their own logic — these get read for their design,
  // then that design is applied to the working pages. Porting them does not
  // touch anything behind them.
  { src: "src/login.html", name: "DsLogin", slug: "login" },
  { src: "src/signup.html", name: "DsSignup", slug: "signup" },
  { src: "src/verify.html", name: "DsVerify", slug: "verify" },
  { src: "src/cart.html", name: "DsCart", slug: "cart" },
  { src: "src/checkout.html", name: "DsCheckout", slug: "checkout" },
  { src: "src/thanks.html", name: "DsThanks", slug: "thanks" },
  { src: "src/account.html", name: "DsAccount", slug: "account" },

  // ── Manage / Installer Hub (his dash-*) ─────────────────────────────────
  { src: "src/dash-home.html", name: "DsDashHome", slug: "dash-home" },
  { src: "src/dash-products.html", name: "DsDashProducts", slug: "dash-products" },
  { src: "src/dash-product.html", name: "DsDashProduct", slug: "dash-product" },
  { src: "src/dash-billing.html", name: "DsDashBilling", slug: "dash-billing" },
  { src: "src/dash-downloads.html", name: "DsDashDownloads", slug: "dash-downloads" },
  { src: "src/dash-learning.html", name: "DsDashLearning", slug: "dash-learning" },
  { src: "src/dash-course.html", name: "DsDashCourse", slug: "dash-course" },
  { src: "src/dash-certificates.html", name: "DsDashCertificates", slug: "dash-certificates" },
  { src: "src/dash-settings.html", name: "DsDashSettings", slug: "dash-settings" },
  { src: "src/dash-support.html", name: "DsDashSupport", slug: "dash-support" },
  { src: "src/dash-team.html", name: "DsDashTeam", slug: "dash-team" },
  // An internal preview harness for the nine transactional emails, not a route
  // anyone navigates to — staged so the email designs can be reviewed too.
  { src: "src/dash-emails.html", name: "DsDashEmails", slug: "dash-emails" },

  // ── Work surface (his work-*) ───────────────────────────────────────────
  { src: "src/work-home.html", name: "DsWorkHome", slug: "work-home" },
  { src: "src/work-projects.html", name: "DsWorkProjects", slug: "work-projects" },
  { src: "src/work-project.html", name: "DsWorkProject", slug: "work-project" },
  { src: "src/work-library.html", name: "DsWorkLibrary", slug: "work-library" },
  { src: "src/work-rate.html", name: "DsWorkRate", slug: "work-rate" },
  { src: "src/work-programme.html", name: "DsWorkProgramme", slug: "work-programme" },

  // ── the rest ────────────────────────────────────────────────────────────
  { src: "src/ada.html", name: "DsAda", slug: "ada" },
  { src: "src/doc-preview.html", name: "DsDocPreview", slug: "doc-preview" },

  // ── his admin panel, 24-26 August ──────────────────────────────────────
  // Staged for review only. Each screen carries its own .adm-shell and its
  // behaviour lives in six admin-*.js files that are NOT ported, so these
  // render his design against his sample data and do nothing. Our live
  // admin at /admin/* is untouched and remains the working one.
  { src: "src/admin-account.html", name: "DsAdminAccount", slug: "admin-account" },
  { src: "src/admin-ada.html", name: "DsAdminAda", slug: "admin-ada" },
  { src: "src/admin-ai.html", name: "DsAdminAi", slug: "admin-ai" },
  { src: "src/admin-certificates.html", name: "DsAdminCertificates", slug: "admin-certificates" },
  { src: "src/admin-coupons.html", name: "DsAdminCoupons", slug: "admin-coupons" },
  { src: "src/admin-courses.html", name: "DsAdminCourses", slug: "admin-courses" },
  { src: "src/admin-documents.html", name: "DsAdminDocuments", slug: "admin-documents" },
  { src: "src/admin-emails.html", name: "DsAdminEmails", slug: "admin-emails" },
  { src: "src/admin-enrolments.html", name: "DsAdminEnrolments", slug: "admin-enrolments" },
  { src: "src/admin-entitlements.html", name: "DsAdminEntitlements", slug: "admin-entitlements" },
  { src: "src/admin-events.html", name: "DsAdminEvents", slug: "admin-events" },
  { src: "src/admin-home.html", name: "DsAdminHome", slug: "admin-home" },
  { src: "src/admin-installations.html", name: "DsAdminInstallations", slug: "admin-installations" },
  { src: "src/admin-invoices.html", name: "DsAdminInvoices", slug: "admin-invoices" },
  { src: "src/admin-issued.html", name: "DsAdminIssued", slug: "admin-issued" },
  { src: "src/admin-login.html", name: "DsAdminLogin", slug: "admin-login" },
  { src: "src/admin-marketing.html", name: "DsAdminMarketing", slug: "admin-marketing" },
  { src: "src/admin-organisations.html", name: "DsAdminOrganisations", slug: "admin-organisations" },
  { src: "src/admin-people.html", name: "DsAdminPeople", slug: "admin-people" },
  { src: "src/admin-pricing.html", name: "DsAdminPricing", slug: "admin-pricing" },
  { src: "src/admin-products.html", name: "DsAdminProducts", slug: "admin-products" },
  { src: "src/admin-purchases.html", name: "DsAdminPurchases", slug: "admin-purchases" },
  { src: "src/admin-quotations.html", name: "DsAdminQuotations", slug: "admin-quotations" },
  { src: "src/admin-rates.html", name: "DsAdminRates", slug: "admin-rates" },
  { src: "src/admin-submissions.html", name: "DsAdminSubmissions", slug: "admin-submissions" },
  { src: "src/admin-subscriptions.html", name: "DsAdminSubscriptions", slug: "admin-subscriptions" },
  { src: "src/admin-support.html", name: "DsAdminSupport", slug: "admin-support" },
  { src: "src/admin-system.html", name: "DsAdminSystem", slug: "admin-system" },
  { src: "src/admin-templates.html", name: "DsAdminTemplates", slug: "admin-templates" },
  { src: "src/admin-whats-new.html", name: "DsAdminWhatsNew", slug: "admin-whats-new" },

];

// Hand-authored pages that live alongside the ported ones. They are written
// directly as JSX in src/ds/custom/ and are never generated or overwritten —
// this list only puts them in the manifest so they get a /preview route.
const CUSTOM = [
  { name: "DsCiviq", slug: "civiq", dir: "custom" },
  // His What's New hub: the latest-builds table comes from the changelog.
  { name: "DsWhatsNew", slug: "whats-new", dir: "custom" },
  // His quotation page; the builder inside it is live.
  { name: "DsQuote", slug: "quote", dir: "custom" },
  // His pricing page; every figure on it reads from the catalogue.
  { name: "DsPricing", slug: "pricing", dir: "custom" },
  // His Learn page; the two real course prices read from the catalogue.
  { name: "DsLearn", slug: "learn", dir: "custom" },
  // The five live product pages. Their generated *Page component takes `d`
  // (the release history, from the changelog); these thin wrappers supply it.
  { name: "DsQuiv", slug: "quiv", dir: "custom" },
  { name: "DsHeron", slug: "heron", dir: "custom" },
  { name: "DsRateGen", slug: "rategen", dir: "custom" },
  { name: "DsMep", slug: "mep", dir: "custom" },
  { name: "DsTimePro", slug: "timepro", dir: "custom" },
];

// Corrections to his navigation, applied to the nav slice before conversion.
//
// His Products menu lists things that are not products: the mobile companion
// app (nothing to buy), Ada (an assistant inside the products), and "How ADLM
// works" (an explainer). Each edit asserts that it matched, so if he
// restructures the nav upstream this fails loudly instead of silently doing
// nothing.
// Corrections to his navigation.
//
// There are none, deliberately.
//
// His Products menu used to list Ada, the mobile app and "How ADLM works"
// among the products, so three edits removed them. His 2026-08-18 update
// restructured the panel into two columns — "By product" (the six things you
// buy) and "Part of the studio" (Ada, On your phone, The Installer Hub, Build
// a quotation, Compare products) — which is the same distinction, made better
// and in his own design.
//
// The edits then became harmful: they were deleting entries from the column
// where they now correctly belong. Anything added here must be re-checked
// against his nav after every upstream pull.
const NAV_EDITS = [];

// Remove every <li> whose anchor points at `href`. Returns [html, count].
function dropNavItem(html, href) {
  const re = new RegExp(`\\s*<li><a href="${href}"[\\s\\S]*?</li>`, "g");
  const count = (html.match(re) || []).length;
  return [html.replace(re, ""), count];
}

function editNav(html) {
  let out = html;
  for (const edit of NAV_EDITS) {
    let applied = 0;
    if (edit.drop) {
      // `keepLast` leaves the panel-footer link in place: the footer is a
      // utility row, not a claim that the target is a product.
      if (edit.keepLast) {
        [out, applied] = dropNavItem(out, edit.drop);
      } else {
        [out, applied] = dropNavItem(out, edit.drop);
        const footRe = new RegExp(`\\s*<a href="${edit.drop}">[^<]*</a>`, "g");
        out = out.replace(footRe, "");
      }
    } else if (edit.dropFoot) {
      const footRe = new RegExp(`\\s*<a href="${edit.dropFoot}">[^<]*</a>`, "g");
      applied = (out.match(footRe) || []).length;
      out = out.replace(footRe, "");
    } else if (edit.from) {
      const re = new RegExp(edit.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      applied = (out.match(re) || []).length;
      out = out.replace(re, edit.to);
    }
    if (!applied) {
      throw new Error(
        `[port-ds-html] nav edit did not match: ${edit.label}. ` +
          "The upstream nav markup has changed — re-check NAV_EDITS.",
      );
    }
    console.log(`[port-ds-html] nav   ${edit.label} (${applied})`);
  }
  return out;
}

// Per-page surgery: swap the values that would otherwise go stale for live
// ones, and nothing else. His markup, classes, copy and section order survive
// untouched — see the @@token@@ mechanism in lib/html-to-jsx.mjs.
//
// Each entry asserts it matched, so if he rewrites a section upstream this
// fails loudly rather than silently leaving a hardcoded figure behind.

// The hand-written release list on every product page: from `<div class="rel
// rise">` through the "See updates" link that follows it. Replaced wholesale by
// the changelog-driven component, which renders the same markup from
// src/data/changelogs.js — the source the What's New pages already use.
const RELEASE_BLOCK =
  /<div class="rel rise">[\s\S]*?See updates across every product[\s\S]*?<\/p>/;

// CIVIQ has shipped nothing yet, so his page shows a "Nothing shipped yet"
// card where the others show a list. Same replacement, different shape —
// DsReleaseHistory renders that same empty state, and swaps itself for a real
// list the day the first CIVIQ release lands.
const EMPTY_RELEASE_BLOCK =
  /<div class="card tilt rise"[\s\S]*?See updates across every product[\s\S]*?<\/p>/;

const releaseEdit = (slug, empty = false) => ({
  label: `release history from the changelog (${slug})`,
  findRe: empty ? EMPTY_RELEASE_BLOCK : RELEASE_BLOCK,
  replace: "@@d.releases@@",
});


// The pricing block every product page carries: a headline figure and a
// sentence giving the yearly price, the saving and the install fee. All four
// were typed into the markup and had already drifted — the Revit MEP page said
// "No install fee" while the catalogue charges ₦20,000.
//
// The whole sentence becomes one token, not just the numbers, because his
// wording changes shape with the fee ("One-time install fee of X" vs "No
// install fee") and only the live figure knows which applies.
const priceEdits = (monthly, ledeStart) => [
  {
    label: "price headline from the catalogue",
    find: `<h2>${monthly} a month,`,
    replace: "<h2>@@d.monthly@@ a month,",
  },
  {
    label: "price sentence from the catalogue",
    findRe: new RegExp(`<p class="lede">${ledeStart}[^<]*</p>`),
    replace: '<p class="lede">@@d.priceLine@@</p>',
  },
];


// The six plan cards on the pricing page, and the three course cards below
// them. Only the price lines are swapped — his imagery, blurbs, feature lists
// and CTAs are left exactly as written.
//
// Anchored on each card's <h3>, because the price lines are not unique on their
// own: "No install fee" appears on three cards, so matching the line alone
// would rewrite the wrong card.
const rxEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const planEdit = (name, key) => ({
  label: `plan card prices from the catalogue (${name})`,
  findRe: new RegExp(
    `(<h3>${rxEscape(name)}</h3>[\\s\\S]*?)` +
      `<div class="amt">[^<]*<small>[^<]*</small></div>` +
      `([\\s\\S]*?)<p class="yr">[\\s\\S]*?</p>` +
      `([\\s\\S]*?)<p class="inst">[^<]*</p>`,
  ),
  replace:
    `$1<div class="amt">@@d.${key}.monthly@@<small> / mo</small></div>` +
    `$2<p class="yr">@@d.${key}.yearLine@@</p>` +
    `$3<p class="inst">@@d.${key}.installLine@@</p>`,
});

// Course cards carry a single yearly figure and no install line.
const courseEdit = (name, key) => ({
  label: `course card price from the catalogue (${name})`,
  findRe: new RegExp(
    `(<h3>${rxEscape(name)}</h3>[\\s\\S]*?)` +
      `<div class="amt">[^<]*<small>[^<]*</small></div>`,
  ),
  replace: `$1<div class="amt">@@d.${key}.yearly@@<small> / yr</small></div>`,
});

// Live components dropped into his static markup.
//
// The promo band was the first of these and was handled as a special case;
// there are two now, so it is a table. A slot token is bracket-free on purpose
// — htmlToJsx scans for "<" and would lowercase `<DsThing />` into an unknown
// element that renders nothing at all.
const SLOTS = {
  DsPromoSlot: { component: "DsPromoLive", from: "../DsPromoLive.jsx" },
  DsCheckoutSlot: { component: "DsCheckoutWire", from: "../DsCheckoutWire.jsx" },
  DsCheckoutSummarySlot: {
    component: "DsCheckoutSummary",
    from: "../DsCheckoutSummary.jsx",
  },
  DsSocialSlot: {
    component: "SocialSignIn",
    from: "../../components/SocialSignIn.jsx",
  },
};

const PAGE_EDITS = {
  // His social buttons are two dead links — <a href="dash-home"> and
  // <a href="verify"> — with no logo on either and no Autodesk at all. They
  // are replaced by the live component, which draws each provider's real mark,
  // runs the PKCE flow and only renders the providers that are configured.
  // His own divider goes with them, because the component draws its own.
  "src/login.html": [
    {
      findRe: /<div class="divider">or<\/div>\s*<div class="auth2-alt">[\s\S]*?<\/div>/,
      replace: "@@DsSocialSlot@@",
    },
  ],
  "src/signup.html": [
    {
      findRe: /<div class="divider">or<\/div>\s*<div class="auth2-alt">[\s\S]*?<\/div>/,
      replace: "@@DsSocialSlot@@",
    },
  ],

  // His checkout form posts nowhere: the "Pay" control is <a href="thanks">,
  // so no order was ever created — and the bank box is filled in with an
  // account that is not ours. The whole form is replaced by the live one,
  // which keeps his classes and fills the account details from the API.
  "src/checkout.html": [
    {
      findRe: /<form onsubmit="return false">[\s\S]*?<\/form>/,
      replace: "@@DsCheckoutSlot@@",
    },
    // His order summary states a sample order — "5 seats across 3 products",
    // "Then ₦128,000 monthly until cancelled" — beside the control that takes
    // the money, and the #ord-rows div his script never fills. Replaced by the
    // real cart. His <h3> and the trust badges below it are left alone.
    {
      findRe: /<p class="sub" id="ord-note">[\s\S]*?Edit cart<\/a><\/p>/,
      replace: "@@DsCheckoutSummarySlot@@",
    },
  ],
  "src/quiv.html": [releaseEdit("quiv"), ...priceEdits("₦50,000", "Or ₦500,000")],
  "src/heron.html": [releaseEdit("heron"), ...priceEdits("₦12,000", "Or ₦120,000")],
  "src/rategen.html": [releaseEdit("rategen"), ...priceEdits("₦8,000", "Or ₦70,000")],
  "src/mep.html": [releaseEdit("mep"), ...priceEdits("₦18,000", "Or ₦180,000")],
  "src/timepro.html": [releaseEdit("timepro"), ...priceEdits("₦2,000", "Or ₦20,000")],

  // His "Latest across the toolkit" table stated each product's newest build
  // in the markup, and had fallen behind on three of seven rows. The whole
  // <tbody> is replaced; his <table>, <thead> and classes are untouched.
  "src/whats-new.html": [
    {
      label: "latest-builds table from the changelog",
      findRe: /<tbody>[\s\S]*?<\/tbody>/,
      replace: "@@d.latest@@",
    },
    {
      // His hero promises "what was broken before" — the exact framing we just
      // took off the live release notes. The page should read as a product
      // moving forward, not a list of past faults.
      label: "hero lede without the defect framing",
      find: "Every release, written in plain English. What shipped, what improved, and what was broken before.",
      replace: "Every release, written in plain English. What shipped, what improved, and what it means for your work.",
    },
  ],

  // His quotation builder. The markup between `.qt-build` and the end of the
  // summary panel is what assets/js/quote.js drives; DsQuoteBuilder reproduces
  // that markup and its arithmetic, priced from the catalogue instead of the
  // literal in his script — which had install at 0 for Revit MEP and CIVIQ.
  // The two real courses on the Learn page. The third card — "Rates & 2D
  // Takeoff" at ₦85,000 — is deliberately NOT wired: it has no catalogue row
  // because the course does not exist. Richard's own notes flag its name,
  // price and syllabus as provisional. Leaving the figure hardcoded keeps it
  // visible as the placeholder it is; see docs/richard-snag-list.md.
  "src/learn.html": [
    courseEdit("BIM for Building Works", "bimbld"),
    courseEdit("BIM for MEP &amp; HVAC", "bimmep"),
  ],

  "src/pricing.html": [
    planEdit("QUIV", "revit"),
    planEdit("RateGen", "rategen"),
    planEdit("HERON", "planswift"),
    planEdit("Revit MEP", "mep"),
    planEdit("Time Pro", "qsTakeoff"),
    planEdit("CIVIQ", "civil3d"),
    courseEdit("BIM for Building Works", "bimbld"),
    courseEdit("BIM for MEP &amp; HVAC", "bimmep"),
    {
      // The same saving stated a fourth time, in the FAQ.
      label: "FAQ saving figure from the catalogue",
      find: "is ₦100,000 saved a year, per PC.",
      replace: "is @@d.revit.saving@@ saved a year, per PC.",
    },
    {
      // The compare table's "From" row, same figures a third time.
      label: "compare-table prices from the catalogue",
      // The opening <tr> must be consumed too. Matching from the <th> left the
      // wrapper behind, so the component's own <tr> landed inside it — the
      // browser hoisted it out and the leftover row collapsed into a single
      // cell holding all the text, which dragged the row-header column to
      // 776px and pushed the table into horizontal scroll.
      findRe: /<tr>\s*<th class="rowhead" scope="row">\s*From<small>[^<]*<\/small><\/th>[\s\S]*?<\/tr>/,
      replace: "@@d.compareRow@@",
    },
  ],

  "src/quote.html": [
    {
      label: "quotation builder wired to the catalogue",
      findRe: /<div class="qt-build">[\s\S]*?<div class="panel rise qt-panel">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      replace: "@@d.builder@@\n    </div>\n  </div>",
    },
  ],

  "src/civiq.html": [
    // Pricing was typed into the markup; read it from the catalogue instead.
    { find: "₦70,000 a month,", replace: "@@d.monthly@@ a month," },
    {
      find: "Or ₦700,000 a year and save ₦140,000. Pricing indicative until release.",
      replace:
        "Or @@d.yearly@@ a year and save @@d.saving@@. Pricing indicative until release.",
    },
    releaseEdit("civiq", true),
    // NOTE: a "build roadmap" section was injected here and has been removed.
    // It reused `.fgrid`, which site.css:895 defines as 2 columns and then
    // REDEFINES at line 1937 as `repeat(6,1fr)` — so three cards each took a
    // sixth of the shell and the copy rendered in ~100px columns. Reaching for
    // one of his layout classes without checking its final computed value is
    // how that happened.
    //
    // The roadmap is a real content gap (Road is shipped; culvert, bridge,
    // cofferdam and railway are queued) but it is his design to lay out, so it
    // is on the snag list for him instead: docs/richard-snag-list.md.
  ],
};

function editPage(src, html) {
  const edits = PAGE_EDITS[src];
  if (!edits) return html;
  let out = html;
  for (const e of edits) {
    // A `findRe` edit matches a whole block whose content differs per page —
    // used for the release lists, which are hand-written per product.
    if (e.findRe) {
      if (!e.findRe.test(out)) {
        throw new Error(
          `[port-ds-html] page edit did not match in ${src}: ${e.findRe}. ` +
            "The upstream markup has changed — re-check PAGE_EDITS.",
        );
      }
      out = out.replace(e.findRe, e.replace);
      continue;
    }
    if (!out.includes(e.find)) {
      throw new Error(
        `[port-ds-html] page edit did not match in ${src}: "${e.find.slice(0, 60)}…". ` +
          "The upstream markup has changed — re-check PAGE_EDITS.",
      );
    }
    out = e.once
      ? out.replace(e.find, e.replace)
      : out.split(e.find).join(e.replace);
  }
  console.log(`[port-ds-html] edit  ${src} (${edits.length})`);
  return out;
}

// Pages whose generated component takes live data. The token expressions above
// reference `d`, so the component signature has to provide it.
// ── the app rail ────────────────────────────────────────────────────────────
// His rail is dressed with one sample tenant — "Adeyemi & Partners", 2
// projects, 13 rates, 3 of 7 products. Every one of those is a real number we
// already hold, so each is swapped for a token and filled by DsAppShell from
// the signed-in account. Nothing about the markup or the classes changes; a
// find that stops matching is a build error, so his next update cannot quietly
// reinstate the sample figures.
const RAIL_EDITS = [
  { find: '<span class="dsh-avi">AP</span>', replace: '<span class="dsh-avi">@@d.initials@@</span>' },
  { find: "<b>Adeyemi &amp; Partners</b>", replace: "<b>@@d.orgName@@</b>" },
  { find: "<span>Quantity Surveyors · Lagos</span>", replace: "<span>@@d.orgSub@@</span>" },
  { find: 'Projects <span class="tail">2</span>', replace: 'Projects <span class="tail">@@d.projects@@</span>' },
  { find: 'Rate library <span class="tail">13</span>', replace: 'Rate library <span class="tail">@@d.rates@@</span>' },
  { find: 'Certificates <span class="tail">1</span>', replace: 'Certificates <span class="tail">@@d.certificates@@</span>' },
  { find: 'seats <span class="tail">3 of 7</span>', replace: 'seats <span class="tail">@@d.seats@@</span>' },
  { find: 'Team <span class="tail">3/5</span>', replace: 'Team <span class="tail">@@d.team@@</span>' },
];

function editRail(html) {
  for (const e of RAIL_EDITS) {
    if (!html.includes(e.find)) {
      throw new Error(
        `[port-ds-html] rail edit did not match: "${e.find.slice(0, 60)}…". ` +
          "His rail changed upstream — re-check the markup before removing this.",
      );
    }
    html = html.split(e.find).join(e.replace);
  }
  return html;
}

const DATA_PAGES = new Set([
  "src/learn.html",
  "src/pricing.html",
  "src/quote.html",
  "src/whats-new.html",
  "src/civiq.html",
  "src/quiv.html",
  "src/heron.html",
  "src/rategen.html",
  "src/mep.html",
  "src/timepro.html",
]);

function slice(str, startMark, endMark, label) {
  const a = str.indexOf(startMark);
  const b = str.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error(`could not extract ${label}`);
  return str.slice(a, b + endMark.length);
}

const banner = (from) => `// GENERATED by client/scripts/port-ds-html.mjs — do not edit by hand.
// Ported from RichardEnoch/adlm-studio-site ${from}
// Re-run the script to pick up his changes; hand edits here are lost.
`;

function component({ name, jsx, usesLink, from, wrap, takesData, slots = [] }) {
  const imports = ['import React from "react";'];
  if (usesLink) imports.push('import { Link } from "react-router-dom";');
  for (const token of slots) {
    const slot = SLOTS[token];
    imports.push(`import ${slot.component} from "${slot.from}";`);
  }
  const open = wrap ? `<div className="ds">` : `<>`;
  const close = wrap ? `</div>` : `</>`;
  const args = takesData ? "{ d }" : "";
  // Each slot token renders as {DsThingSlot}. Declaring it here is what keeps
  // the token free of angle brackets — htmlToJsx scans for `<` and would parse
  // them as markup, lowercasing the tag, so `<DsPromo />` came out as
  // `<dspromo />`: an unknown element that renders nothing at all.
  const declared = slots
    .map((token) => `  const ${token} = <${SLOTS[token].component} />;\n`)
    .join("");
  return `${banner(from)}${imports.join("\n")}

export default function ${name}(${args}) {
${declared}  return (
    ${open}
${jsx}
    ${close}
  );
}
`;
}

function main() {
  if (!fs.existsSync(SITE)) {
    console.error(`[port-ds-html] source not found: ${SITE}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_CHROME, { recursive: true });
  fs.mkdirSync(OUT_PAGES, { recursive: true });

  const index = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  // The rail lives in the app screens, not in index.html.
  const dashHome = fs.readFileSync(path.join(SITE, "src/dash-home.html"), "utf8");

  // ── shared chrome ──────────────────────────────────────────────────────
  const chrome = [
    { name: "DsSprite", html: slice(index, '<svg width="0" height="0"', "</defs></svg>", "icon sprite") },
    { name: "DsNav", html: editNav(slice(index, '<nav class="nav">', "</nav>", "nav")) },
    { name: "DsFooter", html: slice(index, '<footer class="foot">', "</footer>", "footer") },
    { name: "DsPromo", html: slice(index, '<section class="promo"', "<!--/promo-->", "promo band") },
    // The signed-in app's rail. His build injects the identical block into
    // every dash-* and work-* page, so it is chrome in exactly the same sense
    // as the nav — sliced once here rather than duplicated 18 times.
    // The app's own icons — 18 symbols the rail and top bar use, none of which
    // appear in the marketing sprite. Two <svg> blocks in his source, sliced
    // together so a symbol cannot be lost by splitting them.
    {
      name: "DsAppSprite",
      html: slice(dashHome, "<!--icons-->", "<!--/icons-->", "app icon sprite"),
    },
    {
      name: "DsRail",
      html: editRail(slice(dashHome, "<!--rail-->", "<!--/rail-->", "app rail")),
      takesData: true,
    },
  ];

  const defects = [];
  const formsWithoutBackend = [];
  const note = (where, r) => {
    for (const s of r.strayCloses) defects.push(`${where}: discarded stray </${s}>`);
    for (const s of r.impliedCloses) defects.push(`${where}: ${s}`);
    for (const a of r.backendlessForms) formsWithoutBackend.push(`${where} (action="${a}")`);
  };

  for (const { name, html, takesData } of chrome) {
    const r = htmlToJsx(html, { indent: 6 });
    note(`index.html (${name})`, r);
    fs.writeFileSync(
      path.join(OUT_CHROME, `${name}.jsx`),
      component({ name, jsx: r.jsx, usesLink: r.usesLink, from: "index.html", wrap: false, takesData }),
      "utf8",
    );
    console.log(`[port-ds-html] chrome ${name}.jsx`);
  }

  // ── pages ──────────────────────────────────────────────────────────────
  for (const page of PAGES) {
    const raw = fs.readFileSync(path.join(SITE, page.src), "utf8");
    let body;

    if (page.src === "index.html") {
      // Home is hand-authored and carries the chrome inline; the page itself is
      // whatever sits between the nav and the footer.
      const navEnd = raw.indexOf("</nav>") + "</nav>".length;
      const footStart = raw.indexOf('<footer class="foot">');
      if (navEnd < 0 || footStart < 0) throw new Error("could not locate index.html body");
      body = raw.slice(navEnd, footStart);
    } else {
      body = raw.slice(raw.indexOf("meta-->") + "meta-->".length);
    }

    // His app bar reads its heading from document.title, split at the pipe.
    // A SPA has one document title, so the heading is carried on the manifest
    // instead — taken from his own <title> rather than invented from the slug.
    // His src/*.html are body fragments; build.js supplies the <head>, so the
    // title lives on the built page at the repo root, not on the source.
    const built = path.join(SITE, `${page.src.replace(/^src\//, "")}`);
    const titleAt = fs.existsSync(built)
      ? fs.readFileSync(built, "utf8").match(/<title>([^<]*)<\/title>/i)
      : null;
    page.title = titleAt ? titleAt[1].split("|")[0].trim() : "";

    body = editPage(page.src, body);

    // Strip the promo band where it is inlined (index.html carries it), so it
    // is placed by exactly the same rule as every other page below.
    const promoAt = body.indexOf('<section class="promo"');
    if (promoAt >= 0) {
      const promoEnd = body.indexOf("<!--/promo-->", promoAt);
      body = body.slice(0, promoAt) + body.slice(promoEnd + "<!--/promo-->".length);
    }

    // His withPromo(), reproduced: the promo band goes immediately ABOVE the
    // closing `<section class="cta">`, and a page with no CTA does not get one
    // — which is how the funnel and app screens end up without it.
    //
    // Position matters more than it looks. The promo band is the "Latest from
    // ADLM" section, so rendering it after the page body — as the shell used to
    // — pushed the closing CTA above it and reordered the page against his
    // design. Injecting it here puts it exactly where his build.js does.
    const ctaAt = body.indexOf('<section class="cta');
    page.promo = ctaAt >= 0;
    if (page.promo) {
      body = `${body.slice(0, ctaAt)}@@DsPromoSlot@@

${body.slice(ctaAt)}`;
    }

    // Whichever live components this page's markup ended up asking for. Read
    // off the body rather than tracked by hand, so an edit that introduces a
    // slot cannot forget to declare it.
    const slots = Object.keys(SLOTS).filter((token) => body.includes(`@@${token}@@`));

    const r = htmlToJsx(body.trim(), { indent: 6 });
    note(page.src, r);
    fs.writeFileSync(
      path.join(OUT_PAGES, `${page.name}.jsx`),
      component({
        name: page.name,
        jsx: r.jsx,
        usesLink: r.usesLink,
        from: page.src,
        wrap: false,
        takesData: DATA_PAGES.has(page.src),
        slots,
      }),
      "utf8",
    );
    console.log(
      `[port-ds-html] page   ${page.name}.jsx  (${Math.round(r.jsx.length / 1024)} KB jsx)`,
    );
  }

  // ── manifest ───────────────────────────────────────────────────────────
  // Generated so adding a page never means touching the router. Each entry is
  // lazy, which is what keeps the staged redesign out of the main bundle.
  const manifest = `${banner("index.html + src/*.html")}import React from "react";

// slug -> /preview/<slug>, component lazily imported.
export const DS_PAGES = [
${[...PAGES.filter((p) => !p.internal).map((p) => ({ ...p, from: `./${p.name}.jsx` })),
   ...CUSTOM.map((p) => ({ ...p, from: `../${p.dir}/${p.name}.jsx`, promo: p.promo !== false }))]
  .map(
    (p) =>
      `  { slug: ${JSON.stringify(p.slug)}, name: ${JSON.stringify(p.name)}, ` +
      `title: ${JSON.stringify(p.title || "")}, ` +
      `promo: ${p.promo === true}, ` +
      `Component: React.lazy(() => import("${p.from}")) },`,
  )
  .join("\n")}
];

export default DS_PAGES;
`;
  fs.writeFileSync(path.join(OUT_PAGES, "manifest.js"), manifest, "utf8");
  console.log(`[port-ds-html] manifest.js (${PAGES.length} pages)`);

  // Remove generated files this run did not write. Renaming a page (DsQuiv ->
  // DsQuivPage, when the product pages gained wrappers) used to leave the old
  // component behind: dead, stale, and still importable — five of them were
  // sitting in pages/ shadowing the real ones by name.
  const expected = new Set([...PAGES.map((x) => `${x.name}.jsx`), "manifest.js"]);
  for (const file of fs.readdirSync(OUT_PAGES)) {
    if (expected.has(file)) continue;
    fs.unlinkSync(path.join(OUT_PAGES, file));
    console.log(`[port-ds-html] pruned stale ${file}`);
  }

  if (formsWithoutBackend.length) {
    console.warn(
      `\n[port-ds-html] ${formsWithoutBackend.length} form(s) have NO BACKEND. They render and\n` +
        "submit to a thank-you page without sending anything anywhere. Wire a real\n" +
        "endpoint before these pages go live or enquiries will be silently lost:\n  " +
        formsWithoutBackend.join("\n  "),
    );
  }

  if (defects.length) {
    console.warn(
      `\n[port-ds-html] ${defects.length} markup defect(s) recovered from, as a browser would.\n` +
        "These are real bugs in the source and worth fixing upstream:\n  " +
        defects.join("\n  "),
    );
  }
}

main();
