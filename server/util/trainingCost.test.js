import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoadTrip, trainingCostEstimate } from "./trainingCost.js";

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

test("two people, two rooms, three nights — the arithmetic", () => {
  const e = trainingCostEstimate(abuja);
  assert.deepEqual(e.assumptions, { people: 2, rooms: 2, days: 3, nights: 3, byRoad: false });
  const by = Object.fromEntries(e.lines.map((l) => [l.key, l.amount]));
  assert.equal(by.flights, 180_000 * 2);
  assert.equal(by.hotel, 60_000 * 2 * 3);
  assert.equal(by.feeding, 20_000 * 2 * 3);
  assert.equal(e.total, 360_000 + 360_000 + 120_000);
});

test("Lagos: a return fare each, every day", () => {
  const e = trainingCostEstimate(lagos);
  const by = Object.fromEntries(e.lines.map((l) => [l.key, l.amount]));
  assert.equal(by.transport, 6_000 * 2 * 2 * 2, "2 people × 2 days × return");
  assert.equal(by.feeding, 20_000 * 2 * 2);
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
