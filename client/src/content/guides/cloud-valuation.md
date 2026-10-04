---
id: cloud-valuation
title: ADLM Cloud: valuations and contract administration
tagline: Value the work done, issue interim payment certificates, and run variations and the contract lock.
version: "2026.10"
updated: 2026-10-04
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Valuation-Guide.pdf
order: 10.3
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers valuing work done, the contract lock, interim payment certificates, variations, the final account and the BIM models attached to a project. It describes the live site on 4 October 2026.

## What's new in 2026.10

- **Certificates say what period they cover.** **Issue certificate** now opens a short form with **Period from**, **Period to**, **Release retention** and **Notes on this certificate**. Before, every certificate showed only its issue date.
- **Release retention.** At practical completion you can release retention on a certificate. The form shows how much is held and refuses to release more.
- **One figure for re-measured work.** The interim certificate and the printed Interim Payment Application now value a re-measured line the same way, from its actual quantity.
- **Net figures under Less previous payments.** The rows under **Less previous payments** now show the net amount (after retention) on screen and in Excel, the same as the PDF.
- **Ada reports for a period.** Ask Ada for "a report for September" and she shows what was valued and certified in that window, with the PDF one click away.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- Price the bill first: see [The bill and the budget](/guides/cloud-bill-budget).
- Only the owner and collaborators with **Full access** can record progress, lock the contract, issue certificates or decide variations.

## Recording progress

Progress is recorded on the **Bill of Quantity**:

1. Tick a line's box to mark it fully done (**Mark as completed**), or type a percentage in its **Done** box. Partial values are paid pro rata.
2. Click **Save changes**. Each save is logged against that day in the daily valuation log.

If a line is re-measured on site, tick **Show actual qty / rate** on the bill's **Home** tab and enter the actual quantity. Certificates and valuations use the actual quantity once it is recorded. An actual quantity of 0 means the work was omitted.

## The Valuation view

Click **Valuation** in **Views**. At the top:

- **Valuation basis**: choose **By Bill of Quantity** (each line valued by its own % complete) or **By Budget (Material & Labour)** (each line valued from its material and labour lines marked on the Budget).
- **Show daily valuation log** and **Show valuation settings** turn those sections on and off.

### Valuation settings

These are saved per project:

| Setting | Default | What it does |
|---|---|---|
| **Client / Employer** | blank | The client's name on the valuation and exported bill |
| **Retention %** | 5 | Held back from the gross value |
| **VAT %** | 7.5 | Added to the subtotal |
| **Withholding tax %** | 2.5 | Deducted from the subtotal |

Set these once, when the contract is agreed, so every later valuation is worked out the same way.

### The daily valuation log

1. Choose a day in **Valuation date**.
2. Read down the figures: **Gross value of works to date**, **Net valuation to date** (after retention), **Less previous payments** ("Not applicable for first valuation" on the first one), **Subtotal before taxes**, and **Total amount due for payment**.
3. Click **Print valuation** for the formal Interim Payment Application, or **Export Excel** for an editable workbook.

## Contract administration

Below the valuation is **Contract administration**, with four views: **Certificates**, **Variations**, **Final account** and **BIM models**.

### Locking the contract

Locking freezes the priced bill as the contract sum. After that, new items become variations and re-measured quantities are recorded as actuals, so the contract figure never moves.

1. Open the **Bill of Quantity** and click the **Contract** tab on the ribbon.
2. Click **Lock contract**.
3. Choose a 4-digit PIN and type it twice. If your account uses email codes for sensitive actions, you enter the code sent to your email instead.

> **Important:** Keep the PIN safe. You need the same 4 digits to unlock the contract, and a lost PIN cannot be recovered without asking ADLM support.

To unlock, click **Unlock** on the same tab and enter the PIN (or the emailed code).

### Interim payment certificates

Each certificate is numbered and carries its own cumulative, less-previous, retention, VAT and withholding tax values, ready for Architect, QS and client sign-off.

1. Open **Certificates** under **Contract administration**.
2. Click **Issue certificate**. A short form opens.
3. Set **Period from** and **Period to**: the period this certificate covers. Leave them blank and the certificate can only show its issue date.
4. Leave **Release retention** at 0 on an ordinary interim. At practical completion, type the amount of retention to release. The label shows how much is held, for example "Release retention (₦2,000,000 held)".
5. Optionally type **Notes on this certificate**. They are printed on it.
6. Click **Issue it**. **Cancel** closes the form without issuing.

The certificate certifies the current value to date as the next IPC. Retention you release is added back on this certificate and taxed with the rest. If you type more than is held, the form says "Only ₦… is held" and will not issue.

Then:

1. Set each certificate's status as it moves along: **Draft**, **Approved**, **Paid**.
2. Download any certificate as an Excel workbook.

Each certificate row shows **Cumulative**, **Less prev.**, **This cert**, **Retention**, VAT, withholding tax and **Net payable**. Only the latest certificate can be deleted, which keeps the sequence honest.

> **Tip:** Lock the contract before the first certificate, so every certificate is measured against the same baseline.

### Variations

1. Open **Variations** and click **Add variation**.
2. Fill in **What changed**, the **Instruction reference**, the **Type** (**Addition** or **Omission**) and the **Value (₦)**.
3. A new variation waits for approval and is not counted yet. Open it and click **Approve** or **Reject**.

Only approved variations move the project total. The tiles show **Approved, net**, **Additions**, **Omissions** and **Waiting for approval**. Lines added to a locked contract from the plugin are raised as variations for you.

### Final account

This shows the closing settlement: **Measured work**, **Preliminaries**, **Provisional and PC sums**, contingency and **Approved variations**, set against the **Contract sum**, with **Certified so far**. The movement reads as an over-run, **Under-run (savings)** or **On budget**.

1. When the job is finished, click **Close the final account**. The contract must be locked first.
2. Confirm. Items, variations and certificates are frozen.
3. Click **Download** for the final account workbook.

To make an adjustment later, click **Reopen**. No new certificate can be issued while the final account is closed.

### BIM models

On QUIV, Revit MEP and CIVIQ projects, the model is exported to IFC and attached to the project automatically when you save from the plugin, one slot each for **Architectural**, **Structural** and MEP. Each slot shows whether it is **Attached** and whether its element IDs match the bill. If the model does not cover the bill, the missing element IDs are listed.

If the plugin was not used, click **Advanced: manual upload** and then **Upload manually** (or **Replace manually**) to attach an IFC file yourself. Files can be up to 100 MB.

## AI in valuations

The valuation figures themselves are plain arithmetic, not AI. Ada can read them for you:

| Ask Ada | What you get |
|---|---|
| "When was the last certificate, and what has been paid?" | Certificates in the range you give, their status, and amounts certified and paid |
| "How many variations were raised and decided in September?" | Variations raised, approved and rejected in that range |
| "Give me a September report I can send the client." | A **Project report** card showing **Work valued**, **Certified**, **Bought** and **Activity entries**. **Open the report** opens the PDF with a **This Period** page |

Ada reads only; she cannot issue a certificate, decide a variation or lock a contract. She never sends anything to your client: you check the PDF and send it yourself. Ada is on for everyone who is signed in. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### I forgot the contract PIN

The PIN cannot be recovered on the website. Contact ADLM support from **Support** in the menu to have it reset.

### Issue it is greyed out

The **Release retention** amount is more than the retention held. Lower it, or leave it at 0. If the final account is closed, click **Reopen** first.

### My old certificates say "Period – to" a date

Certificates issued before October were saved without a period. New certificates carry the period you enter.

### The certificate and the valuation printout show different figures

From October both use the actual quantity of a re-measured line. Check that the actual quantity is entered on the bill and click **Save changes**, then print again.

## Frequently asked questions

### What happens when I lock the contract?

The priced bill becomes the contract sum and stops moving. New items become variations, re-measured quantities are recorded as actuals, and certificates are measured against the locked figure. HERON shows the lock too and saves your edits as actuals.

### When should I release retention?

Typically half at practical completion and the rest at the end of the defects period, as your contract says. Release each part on the certificate for that stage.

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
