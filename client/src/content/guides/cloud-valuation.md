---
id: cloud-valuation
title: ADLM Cloud: valuations and contract administration
tagline: Value the work done, issue interim payment certificates, and run variations and the contract lock.
version: "2026.09"
updated: 2026-10-01
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Valuation-Guide.pdf
order: 10.3
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers the workspace as it is on the live site at the start of October 2026.

## Valuations and the contract

### Valuation

The Valuation view is where you value work done and run the contract.

**Recording progress.** Progress is recorded on the Bill of Quantity:

1. Tick a line's box to mark it fully done (**Mark as completed**), or type a percentage in its **Done** box. Partial values are paid pro rata.
2. Click **Save changes**. Each save is logged against that day in the daily valuation log.

**Valuation workspace.** At the top of the Valuation view:

- **Valuation basis**: choose **By Bill of Quantity** (each line valued by its own % complete) or **By Budget (Material & Labour)** (each line valued from its material and labour lines marked on the Budget).
- **Show daily valuation log** and **Show valuation settings** turn those sections on and off.

**Valuation settings.** These are saved per project:

| Setting | Default | What it does |
|---|---|---|
| **Client / Employer** | blank | The client's name on the valuation and exported bill |
| **Retention %** | 5 | Held back from the gross value |
| **VAT %** | 7.5 | Added to the subtotal |
| **Withholding tax %** | 2.5 | Deducted from the subtotal |

Set these once, when the contract is agreed, so every later valuation is worked out the same way.

**The daily valuation log.**

1. Choose a day in **Valuation date**.
2. Read down the figures: **Gross value of works to date**, **Net valuation to date** (after retention), **Less previous payments** ("Not applicable for first valuation" on the first one), **Subtotal before taxes**, and **Total amount due for payment**.
3. Click **Print valuation** for the formal Interim Payment Application, or **Export Excel** for an editable workbook.

### Contract administration

Below the valuation is **Contract administration**, with four views: **Certificates**, **Variations**, **Final account** and **BIM models**.

**Locking the contract.** Locking freezes the priced bill as the contract sum. After that, new items become variations and re-measured quantities are recorded as actuals, so the contract figure never moves.

1. Open the **Bill of Quantity** and click the **Contract** tab on the ribbon.
2. Click **Lock contract**.
3. Choose a 4-digit PIN and type it twice. If your account uses email verification for sensitive actions, you enter the code sent to your email instead.

> **Important:** Keep the PIN safe. You need the same 4 digits to unlock the contract, and a lost PIN cannot be recovered without asking ADLM support.

To unlock, click **Unlock** on the same tab and enter the PIN (or the emailed code).

**Interim certificates.**

1. Open **Certificates**.
2. Click **Issue certificate**. It certifies the current value to date as the next IPC.
3. Set each certificate's status as it moves along: **Draft**, **Approved**, **Paid**.
4. Download any certificate as an Excel workbook.

Each certificate row shows **Cumulative**, **Less prev.**, **This cert**, **Retention**, VAT, withholding tax and **Net payable**. Only the latest certificate can be deleted, which keeps the sequence honest.

> **Tip:** Lock the contract before the first certificate, so every certificate is measured against the same baseline.

**Variations.**

1. Open **Variations** and click **Add variation**.
2. Fill in **What changed**, the **Instruction reference**, the **Type** (**Addition** or **Omission**) and the **Value (₦)**.
3. A new variation waits for approval and is not counted yet. Open it and click **Approve** or **Reject**.

Only approved variations move the project total. The tiles show **Approved, net**, **Additions**, **Omissions** and **Waiting for approval**. Lines added to a locked contract from the plugin are raised as variations for you.

**Final account.** This shows the closing settlement: **Measured work**, **Preliminaries**, **Provisional and PC sums**, contingency and **Approved variations**, set against the **Contract sum**, with **Certified so far**. The movement reads as an over-run, **Under-run (savings)** or **On budget**.

1. When the job is finished, click **Close the final account**. The contract must be locked first.
2. Confirm. Items, variations and certificates are frozen.
3. Click **Download** for the final account workbook.

To make an adjustment later, click **Reopen**. No new certificate can be issued while the final account is closed.

**BIM models** (QUIV, Revit MEP and CIVIQ projects). When you save from QUIV, the model is exported to IFC and attached to the project automatically, one slot each for **Architectural**, **Structural** and MEP. Each slot shows whether it is **Attached** and whether its element IDs match the bill. If the model does not cover the bill, the missing element IDs are listed.

If the plugin was not used, click **Advanced: manual upload** and then **Upload manually** (or **Replace manually**) to attach an IFC file yourself. Files can be up to 100 MB.

## Troubleshooting

### I forgot the contract PIN

The PIN cannot be recovered on the website. Contact ADLM support from **Support** (`/manage/support`) to have it reset.

## Frequently asked questions

### What happens when I lock the contract?

The priced bill becomes the contract sum and stops moving. New items become variations, re-measured quantities are recorded as actuals, and certificates are measured against the locked figure. HERON shows the lock too and saves your edits as actuals.

### Where do I get help?

Ask Ada, chat with us on WhatsApp, or raise a ticket from **Support** (`/manage/support`).
