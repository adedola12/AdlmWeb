// The launch countdown strip (R20): one place for the date and the words.
//
// Until `at` is set the strip does not render anywhere, so this can ship
// before the date is decided. Once the moment passes it takes itself down.
//
// Launch: 1 October 2026 (confirmed 19 Sep). The hour was not given, so it
// is 10:00 West Africa Time; change `at` for another hour (keep +01:00).
//
// The strip only ever renders on the new site, so whenever anyone can see it
// the new site is already live. It therefore always opens with "The new ADLM
// Studio is live" (see DsLaunchStrip.jsx), and `event` names only what the
// countdown is counting down TO. Never phrase `event` as the site opening:
// the new build went live on 24 Sep while the strip still said "opens in 5
// days". DsLaunchStrip.test.jsx fails if this wording announces the site as
// not yet open.

export const LAUNCH = {
  at: "2026-10-01T10:00:00+01:00",
  event: "Official launch in",
  cta: { label: "See what is new", to: "/whats-new" },
};
