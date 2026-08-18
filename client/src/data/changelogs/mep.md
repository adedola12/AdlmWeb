---
slug: mep
name: ADLM MEP
tagline: MEP quantity takeoff for Autodesk Revit
category: Revit MEP Plugin
accent: sky
icon: zap
status: live
compatibility: Revit 2024, 2025, 2026 & 2027
order: 4
summary: Mechanical, electrical & plumbing quantity takeoff right inside Revit — covers ductwork, pipework, electrical and plumbing disciplines in a dockable, cloud-connected workspace.
---

## 1.8.3 — 31 July 2026 — Sign-in that follows the service

ADLM MEP now resolves the ADLM service through your machine's settings, so sign-in stays reliable and future infrastructure changes never require a new download.

### 🔧 Improved

- **A server move no longer means a new download.** ADLM MEP now reads `ADLM_API_BASE_URL` from your machine — the setting the ADLM Installer Hub already writes — so the service address can change without a new version being shipped to every customer.

### 🐛 Fixed

- **Sign-in failing after the server move.** ADLM MEP had ADLM's server address built into it in three separate places — sign-in, licence-key checks and the cloud save service. When the service moved, all three kept calling the old address, so signing in failed and cloud saves could not complete. There was no setting on your machine that could redirect them. All three now read the address from one place at startup, and it is configurable.
- **Cloud takeoff saves and reopens** recover with this update; they shared the same cause.

## 1.8.2 — July 2026 — Sign in from any network

Your licence seat now stays with your machine wherever you work — office, site or home — so switching networks never interrupts sign-in.

### 🐛 Fixed

- **Sign-in lockouts (DEVICE_MISMATCH) are gone.** Your licence seat was tied to a device identity that included whichever network adapter happened to be active, so plugging into a dock, starting a VPN, or switching between Wi-Fi and ethernet could make the same machine look like a new device and get the login rejected. ADLM MEP now uses the stable hardware identity shared across every ADLM product, and an existing licence binding is migrated automatically the first time you sign in — nothing to do on your side.

## 1.2 — June 2026 — Dockable workspace, dark mode & pricing engine

ADLM MEP gets its dockable workspace, a Revit-native dark mode, full Revit 2024–2027 coverage, and a pricing/budget engine that turns raw quantities into a costed, exportable budget.

### New

- Dockable side panel — all nine MEP disciplines now live inside a native Revit dock panel. Toggle between the dock and a full floating window from the ribbon without losing your work.
- Dark mode — a full Revit-native dark theme (Revit 2025+) with a ThemeManager that follows Revit's own theme so the plugin always feels at home.
- Revit 2024 – 2027 multi-target build — a single hub installer now covers Revit 2024, 2025, 2026 and 2027 so you never need separate downloads.
- Pricing engine & budget dashboard — turn any takeoff into a priced budget. Enter rates manually or pick from your RateGen library; a live Bill total and margin view show profitability per discipline.
- Manual rate editing — every quantity row is editable; rates are stored with provenance so you can see whether each figure came from RateGen, was entered manually, or carried from a previous save.
- Formula-linked Budget Summary Excel export — exports a multi-sheet workbook with per-discipline budget sheets and a master Budget Summary page, all linked by live Excel formulas.
- GitHub Actions CI — automated build matrix covers all Revit targets on every push so broken builds are caught before they reach you.

### Improved

- Compact icon sidebar rail — the left sidebar collapses to icon-only mode, giving more space to the takeoff grid on narrower panels.

### Fixed

- Duct takeoff now correctly filters by level, so quantities no longer bleed across floors.
- Pipe self-comparison bug fixed — pipes were occasionally matched against themselves, inflating takeoff counts.
- Mouse-wheel scrolling restored in the takeoff items list.

## 1.1 — April 2026 — Cloud save, ADLM design system & Revit 2026

The cloud foundation release: save quantities to your ADLM project, get live Excel backups, and work with a fully refreshed ADLM design system — now in Revit 2026.

### New

- Cloud save — takeoff results are pushed directly to your ADLM cloud project so quantities are accessible on the web portal the moment you save.
- XLSX auto-save — takeoff data is also saved locally as an Excel file after every calculation, with a duplicate guard so re-runs don't create extra copies.
- Recent projects panel — quickly reopen any of your last cloud projects from the home screen without searching.
- Highlight in model — click any row in the results list to select and highlight the corresponding Revit element in the viewport.
- RS256 / JWKS licence validation — licences are now signed with industry-standard RS256 and validated via JWKS, replacing the previous scheme.
- Device-bound licensing — a hardware fingerprint ties each licence to the activated device; hardcoded secrets have been removed from the installer.
- Revit 2026 support — sign-in and cloud save now work correctly in Revit 2026.

### Fixed

- Sign-in dialog now closes cleanly on any result and surfaces the actual error message instead of a generic failure.
- TextBox and PasswordBox were silently dropping keyboard input — fixed.
- DataGrid rows now auto-size and fill the window instead of being clipped to a fixed 160 px height.

## 1.0 — August 2025 — ADLM MEP for Revit

ADLM MEP launches with full quantity takeoff across seven MEP disciplines, all extracted live from your Revit model and exportable to Excel.

### New

- Ductwork & duct fittings takeoff — measure supply, return and exhaust ductwork by level, type and system with automatic fitting counts.
- Pipework takeoff — quantity takeoff for mechanical and HVAC pipework, including pipe runs and connections.
- Plumbing fixtures takeoff — count and schedule all plumbing fixtures from the Revit model.
- Lighting takeoff — scheduled count and wattage summary for all lighting fixtures by level.
- Power (electrical) takeoff — electrical device and panel counts extracted directly from the model.
- Cable takeoff — cable tray and conduit lengths measured by level and system.
- Air terminal takeoff — diffusers, grilles and terminal units counted and grouped by system.
- Export to Excel — export any discipline's takeoff to a formatted Excel sheet in one click.
