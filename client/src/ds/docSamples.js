// A worked example for every template the composer can print.
//
// WHY REAL CONTENT AND NOT LOREM
//
// One generic sample sat behind all seven templates, so choosing Bill of
// quantities and choosing Receipt produced the same words on different paper.
// That teaches nobody what the template is for, and it makes the picker feel
// decorative — the choice appeared to change nothing but the header.
//
// Six templates, because that is what his design has: letter, report,
// statement, invoice, receipt and proposal. A bill of quantities and a
// valuation were offered here and are not in his — the picker follows him
// rather than guessing at what else a QS studio might want to print.
//
// Each of these is a document the studio actually sends, with ADLM's real
// products and real prices in it (QUIV ₦500,000 a year, RateGen ₦70,000,
// HERON ₦120,000, Revit MEP ₦180,000, Time Pro ₦20,000), Nigerian VAT at
// 7.5%, and rates and units a Lagos quantity surveyor would recognise. A
// sample with plausible figures gets edited into a real document; a sample
// with "Lorem ipsum" and £100 gets deleted and retyped.
//
// The formatter's rules are the same everywhere: `# ` or A LINE IN CAPITALS
// is a heading, `- ` is a bullet, a line with `|` in it is a table row, a
// blank line ends whatever was running, and `!image url | caption` places a
// picture.

export const SAMPLES = {
  /* ── letter ─────────────────────────────────────────────────────────── */
  letter: `# Implementing ADLM across your practice

Following our conversation last week, this sets out what moving Adeyemi &
Partners onto the ADLM toolkit would involve, what it would cost, and how long
it would take.

WHAT WE PROPOSE

Six workstations on QUIV and Revit MEP, with RateGen as the shared library
behind them. Your rates stop living in six spreadsheets and start living in
one place that every takeoff prices against.

- Six QUIV licences, installed into your Revit 2026 environment
- Two RateGen seats for whoever owns the library
- Two weekends of training at your office
- Your existing rate schedule migrated, not retyped

COSTS

Item | Qty | Amount
QUIV licence, yearly | 6 | 3,000,000
RateGen licence, yearly | 2 | 140,000
Installation, one-time | 6 | 150,000
Training, two weekends | 1 | 450,000

The figures are in naira and hold for thirty days. Nothing is charged until
you accept.

TIMELINE

Installation takes a day. Migrating the rate schedule takes about a week, most
of which is us checking what you already have rather than typing. Training
runs over two weekends so nobody loses a working day.

I am happy to walk the team through it before you decide.`,

  /* ── report ─────────────────────────────────────────────────────────── */
  report: `# Takeoff review — Lekki Phase 2 Tower

Prepared for Adeyemi & Partners at the request of the project QS. It covers
the structural takeoff issued on 14 August and the rates applied to it.

1. WHAT WAS REVIEWED

The Revit model at revision C, the QUIV takeoff exported from it, and the
priced bill returned to the contractor.

- 18 storeys, 2 basement levels
- Gross floor area 24,600 m2
- 1,412 priced items across 9 sections

2. WHAT WE FOUND

The quantities agree with the model to within 1.4% on concrete and 0.8% on
formwork, which is inside the tolerance the practice works to. Two things are
worth correcting before the bill goes out.

Finding | Section | Effect
Blinding measured to the pile cap perimeter, not the excavation | Substructure | 62 m2 under
Rebar laps taken at 40d throughout | Frame | 3.1 t over
Stair balustrade counted per flight, not per metre | Finishes | 74 m short

3. RATES

The rates come from the South West zone of the shared library and were last
reviewed in June. Cement has moved since. Repricing the concrete sections at
today's figure raises the frame by about ₦4.2m on a ₦310m bill — material, but
not enough to change the tender position.

4. RECOMMENDATION

Correct the three items above, reprice the concrete sections, and reissue. The
model does not need to change; the measurement rules do.`,

  /* ── statement ──────────────────────────────────────────────────────── */
  statement: `# Statement of account

Adeyemi & Partners, Ikoyi, Lagos
Account ADLM-0142 · to 31 August 2026

All figures in naira. A running balance is shown after each entry; anything in
the Charged column is owed, anything in Paid has been received.

Date | Reference | Detail | Charged | Paid | Balance
02 Jun 2026 | INV-1018 | QUIV, six licences, yearly | 3,000,000 | | 3,000,000
02 Jun 2026 | INV-1018 | VAT at 7.5% | 225,000 | | 3,225,000
14 Jun 2026 | RCT-1018 | Transfer received | | 3,225,000 | 0
01 Aug 2026 | INV-1042 | RateGen, two seats, yearly | 140,000 | | 140,000
01 Aug 2026 | INV-1042 | VAT at 7.5% | 10,500 | | 150,500
01 Aug 2026 | INV-1043 | On-site training, two weekends | 450,000 | | 600,500
19 Aug 2026 | RCT-1042 | Part payment | | 150,500 | 450,000

OUTSTANDING

₦450,000 against INV-1043, due 31 August. Everything else on the account is
settled.

Payment goes to ADLM Studio, Access Bank, 1634998770. Please quote the invoice
number so it can be matched without our having to ask.`,

  /* ── invoice ────────────────────────────────────────────────────────── */
  invoice: `Item | Qty | Rate | Amount
QUIV licence, yearly, per workstation | 6 | 500,000 | 3,000,000
RateGen licence, yearly, per seat | 2 | 70,000 | 140,000
Revit MEP plugin, yearly | 2 | 180,000 | 360,000
Installation and environment setup | 6 | 25,000 | 150,000
On-site training, two weekends, Lagos | 1 | 450,000 | 450,000
Subtotal | | | 4,100,000
VAT at 7.5% | | | 307,500
Total due | | | 4,407,500

TERMS

Payable within 14 days of the date above. Licences are activated on the day
payment clears and run for twelve months from that date.

Transfers to ADLM Studio, Access Bank, 1634998770, quoting the invoice number.
Card payment is available at adlmstudio.net and activates immediately.

Prices are held in naira. Where a licence is quoted in dollars, the naira
figure above is what is payable.`,

  /* ── receipt ────────────────────────────────────────────────────────── */
  receipt: `Received with thanks from Adeyemi & Partners, Ikoyi, Lagos.

Item | Qty | Amount
QUIV licence, yearly, per workstation | 6 | 3,000,000
RateGen licence, yearly, per seat | 2 | 140,000
Revit MEP plugin, yearly | 2 | 360,000
Installation and environment setup | 6 | 150,000
On-site training, two weekends, Lagos | 1 | 450,000
Subtotal | | 4,100,000
VAT at 7.5% | | 307,500
Paid in full | | 4,407,500

Settled by transfer on 19 August 2026, reference ADP/ADLM/0819, against
invoice INV-1042.

All ten licences are active and run to 18 August 2027. The installers are on
the account at adlmstudio.net under Downloads; each signs in with the same
details as the website, so there is no key to keep.`,


  /* ── proposal ───────────────────────────────────────────────────────────
   *
   * Modelled on the Dutum Company Limited proposal the studio actually sent:
   * a BIM collaborative workspace and training for a quantity surveying
   * department, its purpose stated before its deliverables, and the whole
   * thing justified against what Autodesk and CostX charge for the same work.
   *
   * That competitor table is the part worth keeping. A proposal that only
   * lists what you will do invites the question "why so much"; one that shows
   * Revit at $2,910 a seat a year beside our figure answers it before it is
   * asked.
   */
  proposal: `# A BIM collaborative workspace for the quantity surveying department

Prepared for the Head of Department, Quantity Surveying, Dutum Company
Limited, Lagos. Valid for thirty days from the date above.

1. WHY

The department measures well and prices well, and does both in isolation.
Every estimator holds their own rates, their own takeoff and their own version
of the drawing, and the cost of that only shows at tender, when three people
have priced the same wall three ways.

A collaborative workspace fixes the sharing, not the skill.

- One place every estimator prices against, so a rate corrected once is corrected for everybody
- Real-time visibility of what has been measured and what has not
- 4D programme and 5D cost modelling from the same model, not from a second spreadsheet
- Practices brought in line with ISO 19650

2. WHAT WE WILL DELIVER

Item | Detail
Workspace | Installed across every departmental machine, licensed for one year
Integration | All departmental computers joined to the workspace
BIM software | Autodesk Revit, Navisworks and PlanSwift installed and activated
ADLM plugins | QUIV for Revit and HERON for PlanSwift, on every seat
Rate library | Your existing schedule migrated into RateGen, not retyped
Training | Two weekends on site, then a month of support

Work continues across machines: whoever picks up a job carries on from where
the last person stopped, because the work lives in the workspace rather than
on a desktop.

![A measured model priced straight from the drawing](/adlm/product/takeoff-coloured.jpg)

3. TRAINING

Two weekends on site, then a month of support while the department puts it to
work on a live job. We have run this for practices and for the NIQS, and the
pattern holds: people learn the tool on their own project, not on a demo.

![A cohort at the end of a two-weekend programme](/adlm/events/training-cohort.jpg)

4. WHAT IT COSTS

Item | Seats | Rate | Amount
QUIV for Revit, yearly | 8 | 500,000 | 4,000,000
HERON for PlanSwift, yearly | 4 | 120,000 | 480,000
RateGen, shared library | 2 | 70,000 | 140,000
Workspace setup and integration | 8 | 25,000 | 200,000
Training, two weekends on site | 1 | 450,000 | 450,000
Subtotal | | | 5,270,000
VAT at 7.5% | | | 395,250
Total | | | 5,665,250

5. WHAT THE ALTERNATIVE COSTS

The same capability bought from the international vendors, per user per year,
before training and before anybody adapts it to Nigerian rates.

Product | Price per user | Basis
Autodesk Revit | $2,910 | Annual subscription
Autodesk Navisworks Manage | $2,740 | Annual subscription
Autodesk AEC Collection | $3,560 | Annual subscription
CostX Standard | $6,000 | Per licence
CostX Takeoff | $4,500 | Per licence
CostX maintenance | $1,000 to $1,500 | Per year
PlanSwift Professional | $2,100 | Perpetual, per user
PlanSwift plugins | $150 to $500 | Per plugin

Eight seats of the AEC Collection alone is about $28,480 a year. The figures
above are approximate and move with the vendors — they are given so the
comparison can be checked rather than taken on trust.

6. WHY US

- Priced for this market, not converted into it
- Plugins written for how a Nigerian QS actually measures
- Training included, not sold separately once the licences are signed
- ISO 19650 practices, not just ISO 19650 software
- Support in the same time zone, from the people who wrote the tools

We would be glad to present this to the department and answer questions before
anything is committed.

Quasim Adedolapo
Founder, ADLM Studio`,

};

/**
 * A sample for a template, or the letter as a fallback.
 *
 * A template with no sample of its own is a bug rather than something to
 * paper over, but returning the letter keeps the composer usable while it is
 * being fixed.
 */
export const sampleFor = (template) => SAMPLES[template] || SAMPLES.letter;

/** Every sample, so the composer can tell whether the box is still untouched. */
export const ALL_SAMPLES = Object.values(SAMPLES);
