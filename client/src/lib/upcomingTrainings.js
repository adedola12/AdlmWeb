// Which published training events are still ahead, soonest first.
//
// GET /ptrainings/events returns EVERY published event, sorted by startAt
// ascending and never filtered by date. Two surfaces read it and, until now,
// only one of them knew that:
//
//   /learn/calendar  filtered for itself — "Past sessions drop off".
//   /products        did not, so the Physical Trainings section led with the
//                    six OLDEST events. Each card carries its date, its price
//                    and a View button into the enrolment flow, so the first
//                    thing a visitor met under "Workshops & hands-on sessions"
//                    was a workshop that had already happened.
//
// The rule lives here now so the two cannot drift apart again. A session
// counts as still ahead until the day it ENDS rather than the day it starts,
// so a three-day workshop stays on the page while it is running. endAt is
// optional on the model, so startAt stands in for it.

export function upcomingTrainings(list, now = Date.now()) {
  return (Array.isArray(list) ? list : [])
    .filter((e) => {
      const start = new Date(e?.startAt ?? NaN).getTime();
      if (!Number.isFinite(start)) return false;
      // A date the server stored in a shape Date cannot read must not take the
      // event off the page; fall back to when it starts.
      const end = new Date(e.endAt ?? NaN).getTime();
      return (Number.isFinite(end) ? end : start) >= now;
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

export default upcomingTrainings;
