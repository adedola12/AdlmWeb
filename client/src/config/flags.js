// Launch switches, read at build time (R21). Off unless the build sets them:
//
//   VITE_FLAG_BEYOND_BIM_LIVE=true         /beyondbim and /beyondbim/register
//   VITE_FLAG_TRAINING_CALENDAR_LIVE=true  /learn/calendar
//
// Off, the public sees a "Coming soon" page on each route and staff still see
// the real page, so it can be reviewed on the live site before it opens.
// TODO(adlm): turn each on (Vercel environment variable, then redeploy) when
// the programme and the calendar are confirmed.

const on = (v) => /^(1|true|on|yes)$/i.test(String(v ?? "").trim());

export const FLAGS = {
  BEYOND_BIM_LIVE: on(import.meta.env.VITE_FLAG_BEYOND_BIM_LIVE),
  TRAINING_CALENDAR_LIVE: on(import.meta.env.VITE_FLAG_TRAINING_CALENDAR_LIVE),
};
