# ADLM product briefs for outbound email

The email writer (server/util/prospecting/writer.js) reads this file. For each
prospect it gets the "About ADLM Studio" section plus the ONE product section
that matches the prospect's profile, and nothing else.

How to edit:
- Write plainly, as you would explain the product to a QS on the phone. Facts,
  not slogans. The writer is told never to claim anything that is not here.
- Each product has a `Status:` line. `placeholder` and `draft` sections are
  used for previews only. The live daily run will NOT draft emails for a
  product until you change its line to `Status: ready`.
- Lines starting `TODO:` are for you to fill in. Delete the TODO once done.
- Keep each section short. Around 150 to 250 words is plenty.

The product text below was copied from the website catalogue on 26 Sep 2026
as a starting point. Check it, cut the marketing tone, and add proof.

## About ADLM Studio

Status: draft

ADLM Studio is a Nigerian company that builds quantity surveying and BIM
software for the Nigerian and African construction industry. The products are
built for how QSs here actually work: Nigerian bills of quantities, local
material and labour rates, NGN pricing.

TODO: One or two proof points about ADLM as a whole. For example: how many QSs
or firms use the products, notable firms or universities (only ones happy to
be named), years in business, NIQS involvement or training delivered.

TODO: Anything the writer must never say (for example, do not name competitors,
do not quote prices in a first email).

## QUIV

Status: draft

What it is: a plugin for Autodesk Revit that takes quantities straight from the
3D model.

What it does:
- Quantity takeoff and quantification from Revit models
- Bill of quantities preparation
- Material schedules and project tracking
- Works with RateGen for current market rates

Who it is for: QS firms and university departments working with BIM or Revit
models, or moving from 2D drawings towards BIM.

TODO: The one result a customer would repeat to a colleague (for example,
"a takeoff that took a week now takes a day"), with a real figure if you have
one.

TODO: What you would show in a 20 minute call.

## HERON

Status: draft

What it is: 2D takeoff and bill preparation software built on PlanSwift
technology, for firms that work from 2D drawings and PDFs.

What it does:
- 2D quantity takeoff and measurement
- Bill of quantities preparation
- Material schedules, valuations and variations
- Tracks construction cost progress
- Scans image drawings so scanned or photographed sheets can be measured

Who it is for: QS consultancies and cost consultants producing bills of
quantities from 2D drawings.

TODO: The one result a customer would repeat to a colleague, with a real
figure if you have one.

TODO: What you would show in a 20 minute call.

## MEP

Status: draft

What it is: the ADLM Revit MEP plugin. Takes mechanical, electrical and
plumbing quantities directly from Revit models.

What it does:
- HVAC, electrical, plumbing and cable quantity takeoff
- Classifies items and filters by system and level
- Bill of quantities for MEPF works
- One-click export to Excel or RateGen

Who it is for: QSs and contractors measuring building services from Revit
models.

TODO: The one result a customer would repeat to a colleague, with a real
figure if you have one.

TODO: What you would show in a 20 minute call.

## RateGen

Status: draft

What it is: rate build-up software with built-in Nigerian material and labour
libraries.

What it does:
- Builds up rates for items of work in a few clicks
- Over 500 building materials and 200 labour items built in
- Add your own materials to your library
- Aligned with BESMM4R

Who it is for: contractors and QSs who price tenders and build up their own
rates, especially estimating and commercial teams.

TODO: The one result a customer would repeat to a colleague, with a real
figure if you have one.

TODO: What you would show in a 20 minute call.
