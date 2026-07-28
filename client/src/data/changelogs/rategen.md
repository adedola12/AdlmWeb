---
slug: rategen
name: RateGen
tagline: Instant rate build-ups & market pricing for QS
category: Desktop App
accent: blue
icon: dollar
status: live
order: 5
summary: Defensible rate build-ups with location-based pricing and a cloud-synced rate library.
---

## 2.5.0 — July 2026 — Build with AI & one master price library

Describe a rate in plain English and let RateGen draft the build-up for you — and every ADLM product now prices from the same master library for your zone.

### ✨ New

- **Build with AI.** A new AI section on the Custom Rate form takes a plain-English description and fills in the entry form for you — components, quantities and prices, with inferred lines tagged so you can see what came from the AI. It shows a confidence figure and an advisory note, and nothing is saved automatically: you review, edit and save through the normal flow, exactly as with a rate you built by hand.
- **Master price library sync.** "Sync from Cloud" — and every sign-in — now pulls the zone-priced master price library maintained by ADLM and merges it with your own rows, so RateGen, QUIV, HERON and ADLM MEP all price from the same single source of truth instead of drifting apart.

### 🔧 Improved

- **Your zone follows your account.** Refreshing your profile stores your account's pricing zone, so every sync prices against your real location. Signing in now refreshes prices silently even when your zone hasn't changed; the confirmation prompt is kept for an actual zone switch.
- **Diagnosable upgrades.** Data-migration problems on startup are written to a timestamped log under your local app data instead of being discarded, so a support ticket can be resolved from the log. Migrations still never block RateGen from starting.

### 🐛 Fixed

- **Sign-in lockouts (DEVICE_MISMATCH) are gone.** Your licence seat was bound to a fingerprint derived from whichever network adapter was fastest and active at that moment — so a dock, a USB ethernet adapter, a VPN, or simply switching between Wi-Fi and cable made the same machine look new and the server rejected the login. RateGen now identifies the machine by its hardware, existing bindings are migrated in place at sign-in, and cached offline licences issued under the old scheme keep working.

## 1.3 — May 2026 — Multi-device cloud sync

Your rate library now follows you — sign in on any device and your custom rates are ready to go.

### New

- Multi-device cloud sync — your custom rates, materials and labour prices are now synced to the cloud and available on any device you sign into, so your library follows you.

## 1.2 — April 2026 — Security hardening & hub installer

A full security pass: RS256 licensing, encrypted credentials and a clean hub installer.

### New

- RS256 / JWKS licence validation — licences are now signed with industry-standard RS256 and validated via JWKS, replacing the previous scheme.
- Encrypted credential storage — the encryption key is registered as an environment variable at install time and never stored in plain text.
- Hub installer packaging — RateGen ships via a single hub installer that handles registration and environment setup automatically.

### Improved

- Device-bound licensing — a hardware fingerprint ties each licence to the activated device; hardcoded secrets have been removed from the build.

## 1.1 — November 2025 — Cloud rate library & zone pricing

Custom rates now live in the cloud and automatically flow into your takeoff plugins — no more manual syncing.

### New

- Save materials & labour to cloud — your custom material and labour prices are pushed to your ADLM account so they are available across HERON and QUIV automatically.
- Zone-based pricing — rates now reflect your selected regional pricing zone, with automatic conversion applied so figures are market-relevant wherever you are.
- Online sign-in — sign in with your ADLM credentials directly from within RateGen; the session stays active across restarts.

## 1.0 — May 2025 — RateGen launches

Build up rates in seconds with pricing tuned for the Nigerian construction market.

### New

- Instant rate build-ups for fast, accurate cost estimates across all major construction trades.
- Location-based pricing and vendor insights tuned for the Nigerian construction market.
- Cloud-synced Rate Library so your whole team works from the same numbers.
- Currency conversion — switch between NGN and other currencies with conversion applied live.
- Dark mode — a full dark theme that is easy on the eyes during long estimating sessions.
- Custom rates & global search — add your own rates to every trade category and search across the entire library in one keystroke.
