---
id: cloud-valuation
title: ADLM Cloud: valuations and contract administration
tagline: Value the work done, issue interim payment certificates, and run variations and the contract lock.
version: "2026.10"
updated: 2026-10-05
platform: Web, any browser (adlmstudio.net)
productKeys: []
pdf: ADLM-Cloud-Valuation-Guide.pdf
order: 10.3
---

This is one part of the [ADLM Cloud guide](/guides/cloud). It covers valuing work done, the contract lock, interim payment certificates, variations, the final account and the BIM models attached to a project. It describes the live site on 5 October 2026.

## What's new in 2026.10

- **A Valuations tab on the new project page.** Projects now open on the new project page. Its **Valuations** tab shows the contract sum, what has been certified and paid, the retention held, and each certificate, with **Certificates**, **Variations** and **Final account** views. Locking the contract, issuing certificates and deciding variations are still done in the classic workspace: **More actions** > **Open the classic workspace**.
- **Certificates say what period they cover.** **Issue certificate** opens a short form with **Period from**, **Period to**, **Release retention** and **Notes on this certificate**. Before, every certificate showed only its issue date.
- **Release retention.** At practical completion you can release retention on a certificate. The form shows how much is held and refuses to release more.
- **One figure for re-measured work.** The interim certificate and the printed Interim Payment Application now value a re-measured line the same way, from its actual quantity.
- **Net figures under Less previous payments.** The rows under **Less previous payments** now show the net amount (after retention) on screen and in Excel, the same as the PDF.
- **Ada reports for a period.** Ask Ada for "a report for September" and she shows what was valued and certified in that window, with the PDF one click away.

## Before you start

- Open the project: see [Projects and your workspace](/guides/cloud-projects).
- Price the bill first: see [The bill and the budget](/guides/cloud-bill-budget).
- Only the owner and collaborators with **Full access** can record progress, lock the contract, issue certificates or decide variations.

## The Valuations tab

Click **Valuations** on the project page. A dot on the tab means a valuation is awaiting approval.

### Before the contract is locked

Until the contract is locked, the tab reads **Valuations open once the contract is locked**: "Locking turns the estimated total into the contract sum. From then on, progress on the bill is what gets valued, and quantities change only through variations."

![The project's Valuations tab.](shot:cloud-project-valuations.png)

A checklist shows whether the project is ready to lock:

- Every bill item is priced (or how many still need a rate).
- The bill has gone to tender.
- The bill and the model agree (or how many model changes there are to review).

If you can edit the project, the button reads **See the project stages** until everything is ready, and **Lock the contract on the classic workspace** once it is. Both take you to the **Overview** tab, where you can move the project on. The lock itself is done in the classic workspace; see [Locking the contract](#locking-the-contract).

### After the contract is locked

Once locked, the tab shows four figures:

- **Contract sum**, with the date it was locked.
- **Certified to date**.
- **Paid to date**.
- **Retention held**.

Below them is **Work done now**, and the list of certificates, newest first. Each shows its number (for example **IPC 3**), its cumulative percentage of the contract and its amount, after VAT and WHT. The line above the list shows the project's settings, for example "Retention 5% · VAT 7.5% · WHT 2.5%".

"No valuations yet" means nothing has been certified on this contract: "Record progress on the bill, then raise the first certificate in the classic workspace."

Switch the view at the top of the tab:

- **Certificates**: the figures and certificates above.
- **Variations**: **Approved, net**, **Additions**, **Omissions** and **Waiting for approval**, then every variation with its reference, date and status. A variation that moves the contract value is marked **Moves the contract value**. "No variations yet" means none have been raised.
- **Final account**: whether the final account is live or closed, and the figures **Against the contract**: the **Contract sum**, the movement and **Certified so far**. Without a lock it reads "Against the estimate, not a contract".

The Valuations tab is for reading. To issue a certificate, raise or decide a variation, or close the final account, open the classic workspace: **More actions** > **Open the classic workspace**.

## Recording progress

Once the contract is locked, record progress on the new project page:

1. Click **Bill** on the project page.
2. Click a line to open its panel.
3. Under **Progress**, click **Set progress** and record how much is done. It feeds the next valuation and the PM dashboard.
4. If the line was re-measured on site, enter the **Actual quantity** in the panel.

Partial values are paid pro rata. Certificates and valuations use the actual quantity once it is recorded. An actual quantity of 0 means the work was omitted. Click **Show actuals** on the **Bill** tab to see what was measured on site beside what the contract says.

You can also record progress in the classic workspace's **Bill of Quantity**:

1. Tick a line's box to mark it fully done (**Mark as completed**), or type a percentage in its **Done** box.
2. To enter a re-measured quantity, tick **Show actual qty / rate** on the bill's **Home** tab and type the actual quantity.
3. Click **Save changes**. Each save is logged against that day in the daily valuation log.

## In the classic workspace: the Valuation view

Open the classic workspace (**More actions** > **Open the classic workspace**), then click **Valuation** in **Views**. At the top:

- **Valuation basis**: choose **By Bill of Quantity** (each line valued by its own % complete) or **By Budget (Material & Labour)** (each line valued from its material and labour lines marked on the Budget).
- **Show daily valuation log** and **Show valuation settings** turn those sections on and off.

> **Important:** In the classic workspace, changes are not kept until you click **Save changes**.

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

In the classic **Valuation** view, below the valuation, is **Contract administration**, with four views: **Certificates**, **Variations**, **Final account** and **BIM models**.

### Locking the contract

Locking freezes the priced bill as the contract sum. After that, new items become variations and re-measured quantities are recorded as actuals, so the contract figure never moves.

1. On the project page, click **More actions** > **Open the classic workspace**.
2. Open the **Bill of Quantity** and click the **Contract** tab on the ribbon.
3. Click **Lock contract**.
4. Choose a 4-digit PIN and type it twice. If your account uses email codes for sensitive actions, you enter the code sent to your email instead.

> **Important:** Keep the PIN safe. You need the same 4 digits to unlock the contract, and a lost PIN cannot be recovered without asking ADLM support.

To unlock, click **Unlock** on the same tab and enter the PIN (or the emailed code).

Back on the new project page, the stage changes to **Contract locked** and the **Valuations** tab opens up.

### Interim payment certificates

Each certificate is numbered and carries its own cumulative, less-previous, retention, VAT and withholding tax values, ready for Architect, QS and client sign-off.

1. In the classic workspace, open **Certificates** under **Contract administration**.
2. Click **Issue certificate**. A short form opens.
3. Set **Period from** and **Period to**: the period this certificate covers. Leave them blank and the certificate can only show its issue date.
4. Leave **Release retention** at 0 on an ordinary interim. At practical completion, type the amount of retention to release. The label shows how much is held, for example "Release retention (₦2,000,000 held)".
5. Optionally type **Notes on this certificate**. They are printed on it.
6. Click **Issue it**. **Cancel** closes the form without issuing.

The certificate certifies the current value to date as the next IPC. Retention you release is added back on this certificate and taxed with the rest. If you type more than is held, the form says "Only ₦… is held" and will not issue.

Then:

1. Set each certificate's status as it moves along: **Draft**, **Approved**, **Paid**.
2. Download any certificate as an Excel workbook.

Each certificate row shows **Cumulative**, **Less prev.**, **This cert**, **Retention**, VAT, withholding tax and **Net payable**. Only the latest certificate can be deleted, which keeps the sequence honest. New certificates appear on the new page's **Valuations** tab straight away.

> **Tip:** Lock the contract before the first certificate, so every certificate is measured against the same baseline.

### Variations

1. In the classic workspace, open **Variations** and click **Add variation**.
2. Fill in **What changed**, the **Instruction reference**, the **Type** (**Addition** or **Omission**) and the **Value (₦)**.
3. A new variation waits for approval and is not counted yet. Open it and click **Approve** or **Reject**.

Only approved variations move the project total. The tiles show **Approved, net**, **Additions**, **Omissions** and **Waiting for approval**. Lines added to a locked contract from the plugin are raised as variations for you, marked **Raised on lock** on the new page.

### Final account

This shows the closing settlement: **Measured work**, **Preliminaries**, **Provisional and PC sums**, contingency and **Approved variations**, set against the **Contract sum**, with **Certified so far**. The movement reads as an over-run, **Under-run (savings)** or **On budget**.

1. When the job is finished, click **Close the final account** in the classic workspace. The contract must be locked first.
2. Confirm. Items, variations and certificates are frozen.
3. Click **Download** for the final account workbook.

To make an adjustment later, click **Reopen**. No new certificate can be issued while the final account is closed.

### BIM models

On QUIV, Revit MEP and CIVIQ projects, the model is exported to IFC and attached to the project automatically when you save from the plugin, one slot each for **Architectural**, **Structural** and MEP. The new page's **Model** tab lists the attached models. In the classic workspace, each slot shows whether it is **Attached** and whether its element IDs match the bill. If the model does not cover the bill, the missing element IDs are listed.

If the plugin was not used, click **Advanced: manual upload** in the classic workspace and then **Upload manually** (or **Replace manually**) to attach an IFC file yourself. Files can be up to 100 MB.

## AI in valuations

The valuation figures themselves are plain arithmetic, not AI. Ada can read them for you:

| Ask Ada | What you get |
|---|---|
| "When was the last certificate, and what has been paid?" | Certificates in the range you give, their status, and amounts certified and paid |
| "How many variations were raised and decided in September?" | Variations raised, approved and rejected in that range |
| "Give me a September report I can send the client." | A **Project report** card showing **Work valued**, **Certified**, **Bought** and **Activity entries**. **Open the report** opens the PDF with a **This Period** page |

Ada reads only; she cannot issue a certificate, decide a variation or lock a contract. She never sends anything to your client: you check the PDF and send it yourself. Ada is on for everyone who is signed in. See [ADLM AI services](/guides/ai-services).

## Troubleshooting

### The Valuations tab says valuations open once the contract is locked

The contract has not been locked yet. Work through the checklist on the tab, then lock the contract in the classic workspace. See [Locking the contract](#locking-the-contract).

### I cannot find Issue certificate on the new page

Certificates are issued in the classic workspace. Click **More actions** > **Open the classic workspace**, then **Valuation** > **Certificates**.

### I forgot the contract PIN

The PIN cannot be recovered on the website. Contact ADLM support from **Support** in the menu to have it reset.

### Issue it is greyed out

The **Release retention** amount is more than the retention held. Lower it, or leave it at 0. If the final account is closed, click **Reopen** first.

### My old certificates say "Period – to" a date

Certificates issued before October were saved without a period. New certificates carry the period you enter.

### The certificate and the valuation printout show different figures

From October both use the actual quantity of a re-measured line. Check that the actual quantity is entered on the bill, then print again.

## Frequently asked questions

### What happens when I lock the contract?

The priced bill becomes the contract sum and stops moving. New items become variations, re-measured quantities are recorded as actuals, and certificates are measured against the locked figure. HERON shows the lock too and saves your edits as actuals.

### When should I release retention?

Typically half at practical completion and the rest at the end of the defects period, as your contract says. Release each part on the certificate for that stage.

### Can my client see the certificates?

Only if you share the project or its dashboard. See [Sharing and collaboration](/guides/cloud-sharing).

### Where do I get help?

Ask Ada, chat with us on WhatsApp on +234 810 650 3524, or raise a ticket from **Support** in the menu.
