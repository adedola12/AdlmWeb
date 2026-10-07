# Download audit (R16, 18 Sep 2026)

What the site lets people download, where it comes from, and whether anything
downloads without a click. Checked in the code on `fix/richard-review-sep16` and
against the live database (read-only).

## Nothing downloads by itself

Every download on the site starts from a click. There is no auto-download, no
download on page load, and no download triggered by a redirect the visitor did
not ask for.

## Every download

| Download | Who can get it | Served from | Notes |
| --- | --- | --- | --- |
| Installer Hub (Windows) | Signed in | ADLM storage `installers/ADLM-Installer-Hub-Setup.exe`, signed link; the Admin setting until uploaded (R15) | Live setting is a Google Drive link today |
| Android app | Anyone | ADLM storage `apps/adlm-android.apk`, signed link; the Admin setting until uploaded (R15) | Live setting is a Google Drive link today |
| Product packages (Downloads page, Installer Hub) | Signed in, licensed | Private R2 installers bucket, signed per request | Unsigned only if `R2_INSTALLERS_BUCKET` is unset (an environment setting, set in production) |
| Complete User Guide (PDF) | Anyone | Bundled with the site (`/docs/`), or the Admin guide URL | No Drive |
| Assignment files | The learner and staff | Private file store, signed (R12) | |
| Certificates | The holder | Printed from the page to PDF (R14) | |
| Reports, invoices, receipts, quotations | Signed in, own records | Generated in the browser | |
| Project calendar (.ics) | Signed in, entitled | API, Bearer token | Fixed here: PM Tracker sent the token in the URL |
| BoQ template (.xlsx) | Signed in, entitled | `/boq-template.xlsx`, or an uploaded copy | `client/public/boq-template.xlsx` does not exist; see below |
| Freebies | Anyone (the Installer Hub reads `/freebies` signed out) | Each freebie's own link | One live freebie links to Google Drive |
| Installer Hub walkthrough video | Anyone who sees the link | Admin setting | A Google Drive link today |

## Fixed in R16

1. **The public reinstall broadcast handed out the installer link.**
   `GET /settings/force-reinstall` answers anyone and included
   `installerHubUrl`. It no longer does; the classic dashboard's reinstall
   banner takes the link from the signed-in summary instead. Neither desktop
   app reads this endpoint (checked in `ADLMInstallerHub` and `adlm-mobile`).
2. **PM Tracker's "Export calendar" put the access token in the URL.** The API
   only reads a Bearer header, so the export opened a 401 page and left the
   token in the browser's history. It now downloads with the header, as the
   Projects screen already did.

## For you to act on

- Upload the two files to ADLM storage (commands in the report). Until then the
  site still serves the Drive links, now as a direct download rather than
  Drive's preview page.
- `boq-template.xlsx`: the Projects screen offers a default BoQ template at
  `/boq-template.xlsx` and says "not found" because the file was never added.
  Add it to `client/public/`, or upload one in the Projects screen.
- The freebie with a Google Drive `downloadUrl`: re-upload it in Admin so it is
  served from our storage.
- The Installer Hub walkthrough video is a Google Drive link. The organisation
  video pipeline (Bunny) is the natural home for it.
