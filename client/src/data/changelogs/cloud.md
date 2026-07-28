---
slug: cloud
name: ADLM Cloud
tagline: Your projects, budgets, billing and reports on the web
category: Web Platform
accent: violet
icon: trending
status: live
order: 6
compatibility: Any modern browser
summary: The web home for every ADLM product — projects and budgets from your plugins, valuations and reports, subscriptions, invoices and your AI assistant.
---

<!--
  Edit this file to publish ADLM Cloud (website / customer portal) updates.
  Same release format as quiv.md:
    ## <version> — <date> — <short title>
    <optional one–two sentence highlight paragraph>
    ### New   (also: Improved / Fixed)   ← only these three groups render
    - bullet

  Versions here are date-based (YYYY.MM) because the platform ships
  continuously rather than in numbered desktop releases.
-->

## 2026.07 — July 2026 — Card payments, auto-renewal, reports & Ada

A big month on the web: pay by card and let your subscription renew itself, download receipts and PDF reports, follow every change on a project, and ask Ada anything.

### ✨ New

- **Pay by card.** Card checkout is live alongside bank transfer, so a subscription can be activated in minutes instead of waiting on a transfer to be confirmed.
- **Subscriptions that renew themselves.** Tick auto-renew at checkout, or turn it on later in Profile → Billing. Your card is charged automatically before your licence expires and the entitlement is extended without a support ticket. You can see the saved card, switch auto-renew off, or remove the card at any time — and if a renewal is declined you get an email and it retries before your access lapses.
- **Downloadable receipts.** Every paid invoice can now be downloaded as a receipt PDF from your invoices page or your account activity feed.
- **Project, PM & Management PDF reports.** Generate a report from any open project — the project report, the PM report, or a management report across your whole portfolio — preview it in the app, then download the PDF.
- **Project activity log.** Profile → Project Activity shows a full trail of everything that has happened on your projects: creations, contract locks, variations, rate and budget edits, certificates, final accounts, model uploads, collaborator changes and PM schedule updates. It exports as a branded, printable PDF.
- **Ada, your AI assistant.** Ada replaces the old help bot: she answers questions about the products and pricing grounded in the real catalogue, and — once you are signed in — about your own projects and subscriptions. She can hand you over to a human on WhatsApp whenever you would rather talk to us.
- **Extra project storage slots.** Buy additional project slots in blocks of ten for any product straight from the purchase page, with the price shown live before you pay.
- **Excel BoQ import for QUIV.** Turn an existing Excel Bill of Quantities into a full QUIV project — it lands on your projects page with the whole budget, valuation, variation, PC-sum and dashboard pipeline behind it. The importer reads real-world QS workbooks (multiple bill sheets, section headings, preambles, lump-sum preliminaries) as well as the downloadable ADLM template, and re-importing a newer copy of the same workbook updates the project in place without losing your procurement marks or completion history. Available on request for accounts with a live QUIV subscription.
- **QUIV for ArchiCAD workspace.** A new web workspace for ArchiCAD takeoffs — Bill of Quantities, element detail, budget dashboard, unit switching and versioned exports.
- **User guides on your dashboard.** Four illustrated PDF guides — the Installer Hub, QUIV for Revit, ADLM Rate Gen, and the combined Installer Hub & ADLM Heron book — are now published on your dashboard and linked from your welcome email.

### 🔧 Improved

- **The portfolio dashboard now shows all of your work.** It was only reading four project types, so HERON, Civil and every materials project were invisible in the rollup. All of them are now included, with the same cost and valuation totals.
- **Buying from outside Nigeria.** Card charges are processed in Naira, which most foreign cards decline — so buyers outside Nigeria are now detected automatically, shown USD pricing, and led with bank transfer instead of hitting a card error. The card route is still there behind an explicit opt-in for anyone holding a Nigerian card.
- **A tidier projects list.** Schedule-only PM tracker projects no longer clutter the takeoffs list, and the sidebar has been reordered around how the products are actually used.
- **Faster help with sign-in problems.** When a plugin sign-in is rejected for a device mismatch, the server now records exactly what happened, so support can resolve it without asking you for screenshots.

### 🐛 Fixed

- **Purchases now grant exactly the duration you paid for**, and a yearly-billed course is capped at exactly one year.
- **Dashboard project counts** were wrong for some products, and a storage bar was showing on products that hold no projects.
- **Your cart survives sign-in.** A restored cart or a `?product=` link now reopens the configurator with your selections intact instead of being wiped, and edits made in the configurator apply to items already in your order straight away.
- **Budgets reflect completed BoQ items**, and the daily valuation log now rebuilds measured items from the project's own state, so valuations reconcile.
- **Nobody is locked out by the old device fingerprint.** The migration that moves a licence from the old device identity to the new one no longer expires on a fixed date — it stays open until each licence has moved across.
