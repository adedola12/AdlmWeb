import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PEOPLE,
  TRAINING_DAYS,
  TRAVEL_RATE_FIELDS,
  isRoadTrip,
  trainingCostEstimate,
  travelPatch,
} from "./trainingCost.js";

const abuja = {
  city: "Abuja", state: "FCT", durationDays: 3, trainingCostNGN: 1_500_000,
  travel: { flightNGN: 180_000, hotelPerNightNGN: 60_000, feedingPerDayNGN: 20_000, localFareNGN: 8_000 },
};
const lagos = {
  city: "Lagos", state: "Lagos", durationDays: 2, trainingCostNGN: 900_000,
  travel: { flightNGN: 180_000, hotelPerNightNGN: 60_000, feedingPerDayNGN: 20_000, localFareNGN: 6_000 },
};

test("Lagos is a Bolt fare, not an airfare", () => {
  // The difference is two orders of magnitude; getting it wrong makes a Lagos
  // training look like it loses money.
  assert.equal(isRoadTrip(lagos), true);
  assert.equal(isRoadTrip(abuja), false);
  const e = trainingCostEstimate(lagos);
  assert.ok(e.lines.some((l) => l.key === "transport"));
  assert.ok(!e.lines.some((l) => l.key === "flights"), "Lagos was given a flight");
});

test("a road trip needs no hotel", () => {
  const e = trainingCostEstimate(lagos);
  assert.ok(!e.lines.some((l) => l.key === "hotel"), "Lagos was given a hotel");
});

test("the flag on the location beats the city name", () => {
  assert.equal(isRoadTrip({ city: "Ibadan", travel: { byRoad: true } }), true);
  assert.equal(isRoadTrip({ city: "Lagos", travel: { byRoad: false } }), false);
});

test("two people, two rooms, a full week — the arithmetic", () => {
  // A training is a week, whatever the location's teaching days say: the trip
  // is a week and costing it shorter is how it comes in under-budgeted.
  const e = trainingCostEstimate(abuja);
  assert.deepEqual(e.assumptions, { people: 2, rooms: 2, days: 7, nights: 7, byRoad: false });
  const by = Object.fromEntries(e.lines.map((l) => [l.key, l.amount]));
  assert.equal(by.flights, 180_000 * 2);
  assert.equal(by.hotel, 60_000 * 2 * 7);
  assert.equal(by.feeding, 20_000 * 2 * 7);
});

test("a week and two people are the defaults, not the location's own duration", () => {
  assert.equal(TRAINING_DAYS, 7);
  assert.equal(DEFAULT_PEOPLE, 2);
  // abuja.durationDays is 3 — what the client is sold. The trip is still a week.
  assert.equal(trainingCostEstimate({ ...abuja, durationDays: 1 }).assumptions.days, 7);
});

test("Lagos: a return fare each, every day of the week", () => {
  const e = trainingCostEstimate(lagos);
  const by = Object.fromEntries(e.lines.map((l) => [l.key, l.amount]));
  assert.equal(by.transport, 6_000 * 2 * 7 * 2, "2 people × 7 days × return");
  assert.equal(by.feeding, 20_000 * 2 * 7);
});

test("one room can be asked for, but never assumed", () => {
  // Two trainers sharing is a decision somebody makes, not a default.
  assert.equal(trainingCostEstimate(abuja).assumptions.rooms, 2);
  assert.equal(trainingCostEstimate(abuja, { rooms: 1 }).assumptions.rooms, 1);
});

test("the fee is reported beside the cost, never inside it", () => {
  const e = trainingCostEstimate(abuja);
  assert.equal(e.fee, 1_500_000);
  assert.equal(e.margin, 1_500_000 - e.total);
  assert.equal(e.coversItself, true);
  // The fee must not be in the total, or the number means nothing.
  assert.ok(e.total < e.fee);
});

test("a training that does not cover itself says so", () => {
  const thin = { ...abuja, trainingCostNGN: 500_000 };
  const e = trainingCostEstimate(thin);
  assert.equal(e.coversItself, false);
  assert.ok(e.margin < 0);
});

test("A MISSING RATE IS NAMED, NOT TREATED AS ZERO", () => {
  // A zero silently makes a trip look cheaper than it is — the whole reason
  // this reports rather than guesses.
  const e = trainingCostEstimate({ city: "Kano", durationDays: 2, travel: {} });
  assert.equal(e.complete, false);
  assert.ok(e.missing.length >= 3, `only named ${e.missing.join(", ")}`);
  assert.ok(e.missing.some((m) => /airfare/i.test(m)));
  assert.ok(e.missing.some((m) => /hotel/i.test(m)));
  assert.ok(e.missing.some((m) => /feeding/i.test(m)));
  assert.ok(e.lines.every((l) => l.amount === 0));
});

test("a complete set of rates reports complete", () => {
  assert.equal(trainingCostEstimate(abuja).complete, true);
  assert.deepEqual(trainingCostEstimate(abuja).missing, []);
});

test("days and nights can be overridden for a one-off", () => {
  const e = trainingCostEstimate(abuja, { days: 5, nights: 6, people: 3 });
  assert.equal(e.assumptions.days, 5);
  assert.equal(e.assumptions.nights, 6);
  const by = Object.fromEntries(e.lines.map((l) => [l.key, l.amount]));
  assert.equal(by.hotel, 60_000 * 3 * 6);
  // Feeding covers the longer of the two: a travelling day is still a day
  // somebody eats.
  assert.equal(by.feeding, 20_000 * 3 * 6);
});

test("an extra cost on the location is carried through with its own label", () => {
  const withKit = { ...abuja, travel: { ...abuja.travel, otherNGN: 75_000, otherLabel: "Projector hire" } };
  const e = trainingCostEstimate(withKit);
  const other = e.lines.find((l) => l.key === "other");
  assert.equal(other.label, "Projector hire");
  assert.equal(other.amount, 75_000);
});

test("rubbish does not throw", () => {
  const e = trainingCostEstimate(null);
  assert.ok(Number.isFinite(e.total));
  assert.equal(e.complete, false);
  assert.equal(trainingCostEstimate({}, { people: -5 }).assumptions.people, 1);
});

// ── The rates off a form, normalised ──

test('byRoad "" means DECIDE FROM THE CITY, not "by air"', () => {
  // The one rule here that fails silently. A <select> sends "" for the default
  // option, and Boolean("") is false — which means "by air". Get it wrong and a
  // Lagos training is costed with two airfares instead of a Bolt fare: a figure
  // two orders of magnitude out that looks perfectly plausible on a sheet.
  assert.equal(travelPatch({ byRoad: "" }).byRoad, null);
  assert.equal(travelPatch({ byRoad: null }).byRoad, null);
  assert.equal(travelPatch({ byRoad: true }).byRoad, true);
  assert.equal(travelPatch({ byRoad: false }).byRoad, false);
});

test("a null byRoad still lets Lagos decide for itself", () => {
  // The end of that chain: the patch says null, and the estimate reads the city.
  const lagos = { city: "Lagos", travel: travelPatch({ byRoad: "", localFareNGN: 4500 }) };
  assert.equal(isRoadTrip(lagos), true);
  // And a flight rate is not what it charges.
  assert.ok(trainingCostEstimate(lagos).lines.some((l) => l.key === "transport"));
  assert.ok(!trainingCostEstimate(lagos).lines.some((l) => l.key === "flights"));
});

test("a rate is clamped at zero, never negative", () => {
  assert.equal(travelPatch({ flightNGN: -5 }).flightNGN, 0);
  assert.equal(travelPatch({ hotelPerNightNGN: "abc" }).hotelPerNightNGN, 0);
  assert.equal(travelPatch({ feedingPerDayNGN: "15000" }).feedingPerDayNGN, 15_000);
});

test("an absent rate is left absent, so it does not wipe a saved one", () => {
  // The form sends the whole block, but a partial patch must not zero the rest.
  const patch = travelPatch({ flightNGN: 180_000 });
  assert.deepEqual(Object.keys(patch), ["flightNGN"]);
});

test("nothing to patch is undefined, not an empty object", () => {
  // An empty object assigned over a saved subdocument is a no-op, but the route
  // reads this to decide whether to touch `travel` at all.
  assert.equal(travelPatch(undefined), undefined);
  assert.equal(travelPatch(null), undefined);
  assert.equal(travelPatch("15000"), undefined);
});

test("the label is trimmed and survives", () => {
  assert.equal(travelPatch({ otherLabel: "  Venue hire  " }).otherLabel, "Venue hire");
  assert.equal(travelPatch({ otherLabel: "" }).otherLabel, "");
});

test("every field the form renders is a key the patch accepts", () => {
  // A field on the form with no key here would take a rate and lose it.
  for (const f of TRAVEL_RATE_FIELDS) {
    assert.deepEqual(travelPatch({ [f.key]: 1234 }), { [f.key]: 1234 }, f.key);
  }
});

test("a nights override that is not a number falls back, never to NaN", () => {
  // The override endpoint takes nights from a query string. "abc" used to make
  // every amount NaN — which serialises to null — while `complete` still said
  // true, so the caller got an estimate that claimed to be whole and carried no
  // figures at all.
  const e = trainingCostEstimate(abuja, { nights: "abc" });
  assert.equal(Number.isFinite(e.total), true);
  assert.equal(e.assumptions.nights, TRAINING_DAYS);
  for (const l of e.lines) assert.equal(Number.isFinite(l.amount), true, l.key);
});

test("a BLANK nights is absent, not zero", () => {
  // Number("") and Number(null) are both 0, so a blank form field read as a
  // number means "no nights away" — which drops the hotel line entirely and
  // produces a total roughly ₦910,000 short that looks perfectly ordinary.
  for (const blank of ["", null, undefined]) {
    const e = trainingCostEstimate(abuja, { nights: blank });
    assert.equal(e.assumptions.nights, TRAINING_DAYS, JSON.stringify(blank));
    assert.ok(e.lines.some((l) => l.key === "hotel"), "the hotel is still costed");
  }
});

test("a negative nights is not an instruction", () => {
  assert.equal(trainingCostEstimate(abuja, { nights: -3 }).assumptions.nights, TRAINING_DAYS);
});

test("an explicit zero nights IS honoured — a same-day trip is a real thing", () => {
  const e = trainingCostEstimate(abuja, { nights: 0 });
  assert.equal(e.assumptions.nights, 0);
  assert.equal(e.lines.some((l) => l.key === "hotel"), false);
});

test("a numeric STRING is a real answer", () => {
  assert.equal(trainingCostEstimate(abuja, { nights: "3" }).assumptions.nights, 3);
});
