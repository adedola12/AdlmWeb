// server/config/takeoffBaselineDefaults.js
//
// The manual-takeoff baseline rate table the Takeoff Time Log ships with.
//
// THESE NUMBERS ARE ADLM'S WORKING ASSUMPTIONS, NOT MEASUREMENTS. They are the
// minutes a competent quantity surveyor is assumed to spend doing each unit of
// work by hand (scale rule, dimension paper, spreadsheet) and they exist so the
// dashboard has a defensible, stated basis from day one. Replace them with
// measured values as soon as ADLM has timed real manual takeoffs; do that by
// creating a NEW baseline version on the admin Time saved page, never by
// editing this file after a version has been used, because every stored session
// records the version it was estimated with and old versions are immutable.
//
// Every figure the dashboard shows is:
//
//   estimatedManualSeconds = 60 * (
//       sheets       * sheetSetupMinutes
//     + area items   * areaItemMinutes
//     + linear items * linearItemMinutes
//     + count items  * countItemMinutes
//     + elements     * revitElementMinutes   (QUIV: element instances)
//     + elementTypes * elementTypeMinutes
//     + boqLines     * boqLineMinutes )
//
//   savedSeconds = max(0, estimatedManualSeconds - activeSeconds)
//
// When a client reports only a total item count (no per-kind split), items are
// costed at `mixedItemMinutes` for PlanSwift products and `revitElementMinutes`
// for Revit products. See docs/takeoff-time-log.md.

export const DEFAULT_BASELINE_VERSION = "2026.09-assumed";

export const DEFAULT_BASELINE_RATES = Object.freeze({
  // Per drawing sheet or view: finding it, checking the scale, orienting,
  // noting the reference on dimension paper.
  sheetSetupMinutes: 8,
  // PlanSwift-style measured items.
  areaItemMinutes: 4, // trace a boundary, read the area, book it
  linearItemMinutes: 2.5, // run a length, book it
  countItemMinutes: 1, // tally a symbol, book it
  // Fallback when a client cannot split items by kind.
  mixedItemMinutes: 3,
  // Revit-style: one element instance measured by hand from the model or the
  // drawing set (dimensioning a wall, door, beam...).
  revitElementMinutes: 1.5,
  // Per distinct category: writing the description, agreeing the unit and the
  // measurement rule, setting up the column or sheet.
  elementTypeMinutes: 5,
  // Per BoQ line written to the output: description, unit, quantity transfer,
  // arithmetic check.
  boqLineMinutes: 3,
});

export const RATE_KEYS = Object.freeze(Object.keys(DEFAULT_BASELINE_RATES));

export const DEFAULT_BASELINE_NOTES =
  "Initial working assumptions set by ADLM Studio in September 2026 for the " +
  "launch of the Takeoff Time Log. Not measured. Replace with timed manual " +
  "takeoffs by creating a new version.";
