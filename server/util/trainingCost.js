// What it costs ADLM to run a physical training at a location.
//
// WHAT THIS IS FOR
//
// The training FEE is fixed and already on the location (trainingCostNGN) —
// that is what the client pays, and it does not move. This is the other side:
// what the studio spends getting two people there and keeping them there, so a
// fee can be set against a real number rather than a feeling.
//
// EVERY FIGURE COMES FROM A RATE SOMEBODY MAINTAINS
//
// There is no flight API here and no live hotel pricing. Inventing either would
// produce a total that looks authoritative and is fiction. Instead each
// location carries its own rates — a flight, a hotel night, a day's feeding,
// a local fare — and this does the arithmetic over them. When a rate is missing
// the estimate says so rather than treating it as zero, because a zero silently
// makes a trip look cheaper than it is.
//
// LAGOS IS NOT A FLIGHT
//
// A training in Lagos is a Bolt fare, not an airfare, and the difference is two
// orders of magnitude. The rule reads the location rather than being a special
// case in the maths, so adding another city you drive to is a data change.
//
// Pure, so every rule is tested without a database.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const low = (v) => String(v || "").trim().toLowerCase();

/** A physical training runs a week. */
export const TRAINING_DAYS = 7;
/** Two go: the owner and Ebun. */
export const DEFAULT_PEOPLE = 2;

/**
 * Is this somewhere the team travels to by road rather than by air?
 *
 * Lagos is the case that matters — it is where the studio is — but the flag on
 * the location wins, so a second base or a nearby city needs no code change.
 */
export function isRoadTrip(location) {
  if (location?.travel?.byRoad === true) return true;
  if (location?.travel?.byRoad === false) return false;
  const where = `${low(location?.city)} ${low(location?.state)}`;
  return /\blagos\b/.test(where);
}

/**
 * The cost of putting on one training.
 *
 * @param {object} location                the TrainingLocation, with its travel rates
 * @param {object} [opts]
 * @param {number} [opts.people]           how many go. Two, unless told otherwise.
 * @param {number} [opts.rooms]            defaults to one room each — two
 *                                         trainers sharing is not an assumption
 *                                         to make silently.
 * @param {number} [opts.days]             teaching days; defaults to the
 *                                         location's own durationDays.
 * @param {number} [opts.nights]           defaults to days, i.e. arrive the day
 *                                         before and leave after the last one.
 * @returns {{total, lines, assumptions, missing, fee}}
 */
export function trainingCostEstimate(location, opts = {}) {
  const t = location?.travel || {};
  // Two, because it is the owner and Ebun who go.
  const people = Math.max(1, Math.round(Number(opts.people) || DEFAULT_PEOPLE));
  // A training is a week. The location's own durationDays is what the CLIENT is
  // sold; the trip is a week whatever the teaching days say, and costing it at
  // the shorter figure is how a trip comes in under-budgeted. Overridable for a
  // one-off.
  const days = Math.max(1, Math.round(Number(opts.days) || TRAINING_DAYS));
  const nights = Math.max(0, Math.round(Number(opts.nights ?? days)));
  const rooms = Math.max(1, Math.round(Number(opts.rooms) || people));
  const road = isRoadTrip(location);

  const missing = [];
  const lines = [];

  // ── Getting there ──
  if (road) {
    const fare = num(t.localFareNGN);
    if (!fare) missing.push("a local fare for this city");
    lines.push({
      key: "transport",
      label: `Local transport, return, ${people} ${people === 1 ? "person" : "people"}`,
      // A return trip each: out and back, every day of the training.
      detail: `${people} × ${days} ${days === 1 ? "day" : "days"} × return fare`,
      amount: fare * people * days * 2,
      rate: fare,
      missing: !fare,
    });
  } else {
    const fare = num(t.flightNGN);
    if (!fare) missing.push("a return airfare for this route");
    lines.push({
      key: "flights",
      label: `Return flights, ${people} ${people === 1 ? "person" : "people"}`,
      detail: `${people} × return airfare`,
      amount: fare * people,
      rate: fare,
      missing: !fare,
    });
  }

  // ── Staying there ──
  // A road trip to the studio's own city needs no hotel; anywhere else does.
  if (!road && nights > 0) {
    const rate = num(t.hotelPerNightNGN);
    if (!rate) missing.push("a hotel rate per night");
    lines.push({
      key: "hotel",
      label: `Hotel, ${rooms} ${rooms === 1 ? "room" : "rooms"}, ${nights} ${nights === 1 ? "night" : "nights"}`,
      detail: `${rooms} × ${nights} × nightly rate`,
      amount: rate * rooms * nights,
      rate,
      missing: !rate,
    });
  }

  // ── Eating ──
  const feed = num(t.feedingPerDayNGN);
  if (!feed) missing.push("a feeding allowance per day");
  // A travelling day is still a day somebody eats, so feeding runs over nights
  // away where there are any, and over the teaching days otherwise.
  const feedDays = road ? days : Math.max(days, nights);
  lines.push({
    key: "feeding",
    label: `Feeding, ${people} ${people === 1 ? "person" : "people"}, ${feedDays} ${feedDays === 1 ? "day" : "days"}`,
    detail: `${people} × ${feedDays} × daily allowance`,
    amount: feed * people * feedDays,
    rate: feed,
    missing: !feed,
  });

  // ── Anything else the location carries ──
  const extra = num(t.otherNGN);
  if (extra) {
    lines.push({
      key: "other",
      label: String(t.otherLabel || "Other costs").trim() || "Other costs",
      detail: "As set on the location",
      amount: extra,
      rate: extra,
      missing: false,
    });
  }

  const total = lines.reduce((a, l) => a + l.amount, 0);
  const fee = num(location?.trainingCostNGN);

  return {
    lines,
    total,
    // The fee is NOT part of the cost — it is what comes in against it. Kept
    // beside so a screen can show both without doing its own arithmetic.
    fee,
    margin: fee ? fee - total : 0,
    marginPercent: fee > 0 ? Math.round(((fee - total) / fee) * 1000) / 10 : 0,
    coversItself: fee > 0 && fee >= total,
    assumptions: { people, rooms, days, nights, byRoad: road },
    // Named, so a screen can say which rate to go and set rather than showing a
    // total that is quietly too low.
    missing,
    complete: missing.length === 0,
  };
}

/** The per-location rates this estimate needs, for a form to render. */
export const TRAVEL_RATE_FIELDS = Object.freeze([
  { key: "flightNGN", label: "Return airfare, per person", hint: "Leave empty for a city you drive to" },
  { key: "hotelPerNightNGN", label: "Hotel, per room per night" },
  { key: "feedingPerDayNGN", label: "Feeding, per person per day" },
  { key: "localFareNGN", label: "Local fare, one way", hint: "Bolt or taxi — used instead of flights on a road trip" },
  { key: "otherNGN", label: "Anything else, per training" },
]);
