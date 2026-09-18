// The launch countdown strip (R20): one place for the date and the words.
//
// Until `at` is set the strip does not render anywhere, so this can ship
// before the date is decided. Once the moment passes it takes itself down.
//
// TODO(adlm): set the launch date and time, in West Africa Time, e.g.
//   at: "2026-10-15T10:00:00+01:00",
// and confirm the wording and where the link goes.

export const LAUNCH = {
  at: "",
  label: "The new ADLM Studio opens in",
  cta: { label: "See what is new", to: "/whats-new" },
};
