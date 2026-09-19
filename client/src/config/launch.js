// The launch countdown strip (R20): one place for the date and the words.
//
// Until `at` is set the strip does not render anywhere, so this can ship
// before the date is decided. Once the moment passes it takes itself down.
//
// Launch: 1 October 2026 (confirmed 19 Sep). The hour was not given, so it
// is 10:00 West Africa Time; change `at` for another hour (keep +01:00).
// TODO(adlm): confirm the wording and where the link goes.

export const LAUNCH = {
  at: "2026-10-01T10:00:00+01:00",
  label: "The new ADLM Studio opens in",
  cta: { label: "See what is new", to: "/whats-new" },
};
