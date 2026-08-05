---
slug: timepro
name: ADLM Time Pro
tagline: Site productivity tracking & programme durations for construction teams
category: Time Pro
accent: orange
icon: trending
status: live
order: 6
compatibility: Windows 10 & 11
summary: Log daily site output, turn it into realistic durations and crew sizes, and export a priced programme straight to Microsoft Project.
---

<!--
  ────────────────────────────────────────────────────────────────────────
  THIS IS THE ONLY FILE YOU EDIT TO UPDATE TIME PRO'S "What's New" PAGE.
  A build step turns every src/data/changelogs/*.md file into
  src/data/changelogs.js automatically
  (npm run gen:changelogs — also runs on every build & dev start).

  RELEASE FORMAT:
    ## <version> — <Month YEAR> — <short title>
    <optional one–two sentence highlight paragraph>
    ### New          (also: Improved / Fixed)
    - bullet

  • The TOP release is automatically marked "Latest".
  • Separators in the heading are " — " (spaces around the dash).
  ────────────────────────────────────────────────────────────────────────
-->

## 1.1.0 — August 2026 — Dark mode, a side menu you can actually read, and MS Project exports that open

Happy new month. August opens with the release Time Pro has been waiting for: the app now has a proper dark mode, the side menu shows its icons and labels instead of blank coloured blocks, and the Microsoft Project export produces a file Project will actually open — priced in your own currency.

### ✨ New

- **Dark mode, everywhere.** A full dark theme across every screen — sign-in, Task Log, Duration Summary, Current Weather, the task editor and the export dialogs. Time Pro follows your Windows light/dark setting the first time you open it, and remembers your choice after that. Switch any time from the moon icon at the bottom of the side menu.
- **Sign out from the side menu.** Signing out no longer means hunting through the profile dropdown at the top of the window. It sits at the bottom of the side menu, under the theme switch.
- **Choose the currency for your export.** The Microsoft Project export now asks which currency your rates are in — Naira, Dollar, Pound, Euro, Cedi, Shilling, Rand, CFA, Dirham, Riyal, Rupee and the Canadian and Australian dollars. Time Pro starts on the currency your Windows region uses and remembers your pick. The rate fields relabel to match, and the currency travels into the file, so Microsoft Project shows costs in the same money you typed.

### 🐛 Fixed

- **The side menu buttons were unreadable.** Current Weather, Task Log and Duration Summary rendered as bright empty blocks — no icon, no label, nothing to tell them apart. Every button now shows its icon and its name, with the active page in ADLM orange and a light tint on hover.
- **Microsoft Project would not open the exported file.** The export produced a file Project rejected, so a programme you had priced and scheduled simply would not load. The file is now built to Microsoft's published specification and validated against it before release, so it opens straight from File → Open.
- **Labour and equipment came through as the wrong kind of resource.** Skilled and unskilled labour were being written as materials and equipment as labour, so hourly rates landed in the wrong column and costed incorrectly. Labour is now hourly labour, equipment is a per-use material, and crews no longer open flagged as over-allocated.
- **The Project Start Date box on the export dialog looked empty.** The date was set, but the field drew nothing — so it read as though you had forgotten to pick one. It now shows the date.
- **"No BOQ quantity entered" when you had entered one.** Items with no logged output history cannot be given an estimated duration, and the export was quietly dropping them behind a message saying the quantity was missing — which was not true. Time Pro now names the items it cannot schedule and tells you what they need: either a Planned Duration typed in by hand, or some logged tasks to learn from.
- **The ADLM logo vanished in dark mode.** The navy wordmark disappeared into the dark side menu. Dark mode now uses a light version of the logo.

### 🔧 Improved

- **Tasks now chain in Microsoft Project.** Each work item is linked finish-to-start to the one before it, so moving the first task reschedules the whole programme instead of leaving you to drag every bar by hand.
- **Rate fields accept the numbers you actually type.** `1,500.00` and `₦1500` used to fall back to zero without saying so. They are now read correctly.
- **A tidier side menu.** Collapsed, the buttons are even squares centred in the rail with the label on hover, instead of thin slivers squeezed against the edge.
