// server/util/sendPool.js
//
// Many messages at once, without exceeding what the account is allowed.
//
// WHAT THIS REPLACES
//
// Every mass sender in this codebase was written as a sequential loop with a
// sleep in it: campaigns pause GAP_MS between recipients, broadcasts run at
// BROADCAST_RATE_PER_SEC (one per second by default), the video notifier sends
// fifty one after another and then waits two seconds. That was the right shape
// when the transport was a reseller's HTTP API with an unknown rate limit and
// no way to ask what it was — one at a time is the only rate you can be sure
// of.
//
// It is the wrong shape now. Eight hundred recipients at one per second is
// thirteen minutes; the same eight hundred at the rate SES actually grants
// lands in about a minute. The sleep was never the point — staying under a
// limit was — so this replaces "wait between messages" with "hold a limit",
// which is a thing you can hold with fifteen sends in flight just as easily as
// with one.
//
// TWO LIMITS, NOT ONE
//
// `ratePerSecond` is SES's rule: a hard per-second ceiling, enforced by them.
// `concurrency` is ours: how many requests we are willing to have open at
// once, which is really a statement about Lambda memory and the Mongo pool the
// worker is probably also using. They are not the same number and conflating
// them gets one of the two wrong.
//
// NOTHING HERE THROWS
//
// A mass send is not an all-or-nothing operation. One bad address must not
// abandon the nine hundred people behind it, so every task is settled and the
// outcome handed back per item — the caller decides what a failure means.

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A pool that admits `concurrency` tasks at a time, no faster than
 * `ratePerSecond` starts per second.
 *
 * `sleep` and `now` are injectable so the tests can run a thousand simulated
 * sends without a thousand real seconds passing.
 */
export function createSendPool({
  concurrency = 1,
  ratePerSecond = 0,
  sleep = defaultSleep,
  now = () => Date.now(),
} = {}) {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  // 0 means "no rate limit" — the concurrency ceiling is then the only one.
  const gap = ratePerSecond > 0 ? 1000 / ratePerSecond : 0;

  let active = 0;
  let nextSlot = 0;
  const waiting = [];

  /**
   * Claim this task's place in the second.
   *
   * The reservation is made synchronously, BEFORE the await, so two tasks
   * admitted in the same tick cannot both read the same `nextSlot` and then
   * both send immediately. Getting that ordering wrong is how a rate limiter
   * quietly becomes a rate suggestion.
   */
  async function takeSlot() {
    if (!gap) return;
    const t = now();
    const at = Math.max(t, nextSlot);
    nextSlot = at + gap;
    if (at > t) await sleep(at - t);
  }

  function pump() {
    while (active < limit && waiting.length) {
      const { task, resolve } = waiting.shift();
      active += 1;
      (async () => {
        await takeSlot();
        return task();
      })()
        .then(
          (value) => resolve({ ok: true, value }),
          (error) => resolve({ ok: false, error }),
        )
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return {
    /** Resolves to `{ ok: true, value }` or `{ ok: false, error }` — never rejects. */
    run(task) {
      return new Promise((resolve) => {
        waiting.push({ task, resolve });
        pump();
      });
    },
    get pending() {
      return waiting.length + active;
    },
  };
}

/**
 * Run `worker` over every item, settled, in parallel up to the pool's limits.
 *
 * `onResult` fires as each one finishes rather than at the end, because the
 * things that consume this — a progress counter, a row marked sent, a line in
 * the log — are the only evidence anybody has that a ten-minute job is alive.
 * Waiting until the end to report would make a working send indistinguishable
 * from a hung one.
 *
 * Results come back in the order the items went in, not the order they
 * finished, so a caller can still line them up against its own list.
 */
export async function mapWithPool(items, worker, options = {}) {
  const { onResult, ...poolOptions } = options;
  const pool = createSendPool(poolOptions);

  return Promise.all(
    items.map((item, index) =>
      pool.run(() => worker(item, index)).then((result) => {
        if (onResult) {
          try {
            // A reporting callback that throws must not take the send with it.
            const p = onResult(item, result, index);
            if (p && typeof p.then === "function") return p.then(() => result, () => result);
          } catch {
            /* nothing here is worth failing a delivered message over */
          }
        }
        return result;
      }),
    ),
  );
}
