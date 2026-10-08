---
slug: hub
name: ADLM Installer Hub
tagline: Install, update and licence every ADLM product from one app
category: Desktop App
accent: blue
icon: book
status: live
order: 8
compatibility: Windows 10 & 11
summary: One signed-in desktop app that installs your ADLM products, keeps them updated, shows what your subscription covers, and gets you help when something goes wrong.
---

<!--
  Edit this file to publish Installer Hub updates. Same release format as
  quiv.md:
    ## <version> — <date> — <short title>
    <optional one–two sentence highlight paragraph>
    ### New   (also: Improved / Fixed)   ← only these three groups render
    - bullet

  Source: the ADLMInstallerHub repo (Setup File.iss AppVersion for the
  version, Data/installer-catalog.json for the product versions it ships).
-->

## 2.0 — October 2026 — A new Installer Hub, and Open for everything you own

The Installer Hub is rebuilt on the new ADLM design: sign in on the splash, see what this PC has, install and update everything from one place, and press Open to start any ADLM software. It now downloads from your ADLM account as a normal Windows setup file.

### ✨ New

- **A new Hub, light or dark.** The splash becomes the sign-in, and a side rail takes you to Dashboard, Installation Center, Free software, Subscriptions, Install history, Profile, Settings and Help. Choose Light, Dark or Match Windows. On a small screen the rail folds to icons.
- **Open, from the Hub.** Every installed product has an Open button. HERON, Rate Gen and Time Pro open themselves; QUIV and SERVIQ open the Revit version they are installed in. With an update waiting, the card shows Update, Open and More.
- **A Dashboard that says what needs you.** Licences about to lapse and updates waiting come first, with what this PC has: Revit, PlanSwift, Excel, Civil 3D and Archicad, found and listed by version.
- **Install history.** Every install, update and repair on this PC, with an export for support.
- **Subscriptions and seats.** See your plan, your next renewal and the seats this PC holds.
- **A setup file instead of a zip.** The Hub downloads as a standard Windows installer: run it and the Hub installs like any other app.
- **Network signal.** The header shows your connection to ADLM, so a slow network can be told apart from a problem.

### 🔧 Improved

- **ADLM software only.** The Hub lists the software you own, never courses.
- **One Hub per PC.** Opening it again brings the open window forward instead of starting a second copy.
- **Your download link is private to you.** The Hub download sits in your ADLM account while you hold an active licence for one of our desktop products, and each link expires after an hour.
- **HERON's PlanSwift import package is kept out of sight,** in a protected ADLM folder instead of on the shared Windows desktop.

### 🐛 Fixed

- **"Update available" that never went away.** The Hub now recognises the build you have installed and only offers an update when there really is a new one.
- **A brand-new PC could not connect.** The Hub now reaches the current ADLM service from the first launch.
- **Installs no longer go ahead when ADLM cannot be reached.** The Hub stops and asks you to try again, instead of installing an out-of-date copy it ships with.

## 1.0 — July 2026 — Everything you own, installed from one place

Sign in once and the Hub shows every product your subscription covers, installs it, keeps it updated, and now ships with a full illustrated user guide.

### ✨ New

- **Illustrated user guide, one click away.** A 21-page guide walks a new user from signing in through their first install, their first update, and the things that commonly go wrong — with an annotated figure of every screen. A **Download User Guide** button now sits in the sidebar under "Raise a ticket".
- **PlanSwift import package for ADLM Heron.** Heron now ships the ADLM TakeOff Package onto your desktop so PlanSwift can merge-import the types, scripts, estimating layouts and plugin tools that cannot safely be copied into storage over your existing data.
- **Product artwork on every card.** Each product now shows its own icon in the Hub instead of a shared ADLM badge.
- **Latest builds for every product** — ADLM Heron 2.9.0, QUIV for Revit 3.1.6, ADLM Rate Gen 2.5.0, ADLM Revit MEP 1.8.2, ADLM Time Pro 1.1.0 and QUIV for ArchiCAD 1.0.0 — all installed and updated from the same place.

### 🔧 Improved

- **Support can install on your machine.** The device-binding check is bypassed for the main ADLM admin account, so a support engineer can install and verify a product on a customer machine without disturbing what your licence is bound to.
- **Clearer product names.** The PlanSwift plugin is now **ADLM Heron** and the Revit plugin is **QUIV for Revit** throughout the Hub, the catalogue notes and the guides — matching the names used on the website.

### 🐛 Fixed

- **"Launch" after an install now works.** Ticking Launch at the end of setup failed with a Windows error because the app needs to start elevated. It now launches correctly.
- **Uninstall cleans up every profile — and asks first.** Uninstalling only ever removed the Hub's data for the administrator who approved it, leaving other Windows users' settings behind. It now clears every profile, asks before deleting your settings (defaulting to keeping them), and a silent uninstall always keeps user data so an upgrade never wipes your setup.
