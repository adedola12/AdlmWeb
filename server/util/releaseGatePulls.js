// server/util/releaseGatePulls.js
//
// Website, API and service changes are signed off on GitHub, not here: branch
// protection makes every merge wait for the approver's review
// (docs/RELEASE_GATE.md). So the sign-off desk lists the open pull requests
// in the protected repositories, with a link to review each one, and the
// approver sees everything waiting for them in one place.
//
// Read-only, public API, no token: the protected repos are public. Cached for
// five minutes per Lambda container, because unauthenticated GitHub allows 60
// calls an hour per IP. A GitHub failure never fails the desk; it comes back
// as `error` and the page says so.

export const PROTECTED_REPOS = [
  { repo: "adedola12/AdlmWeb", label: "Website and API" },
  { repo: "adedola12/adlm-ai-service", label: "AI service" },
  { repo: "adedola12/ADLMRateGen-SingleUser", label: "RateGen (single user)" },
];

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, value: null };

async function gh(path, fetchImpl) {
  const res = await fetchImpl(`https://api.github.com/${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "adlm-release-desk" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

/**
 * Open PRs into each repo's default branch, with where the approver stands:
 * "approved", "changes_requested" or "waiting".
 */
export async function listPullsAwaitingApprover(approverLogin, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache.value && now - cache.at < TTL_MS) return cache.value;

  const login = String(approverLogin || "").toLowerCase();
  const pulls = [];
  let error = "";

  for (const { repo, label } of PROTECTED_REPOS) {
    try {
      const meta = await gh(`repos/${repo}`, fetchImpl);
      const open = await gh(`repos/${repo}/pulls?state=open&base=${encodeURIComponent(meta.default_branch)}&per_page=30`, fetchImpl);
      for (const pr of open) {
        let state = "waiting";
        if (login) {
          const reviews = await gh(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`, fetchImpl);
          // The approver's latest decisive review wins.
          const mine = reviews
            .filter((r) => String(r.user?.login || "").toLowerCase() === login && ["APPROVED", "CHANGES_REQUESTED"].includes(r.state))
            .pop();
          if (mine) state = mine.state === "APPROVED" ? "approved" : "changes_requested";
        }
        pulls.push({
          repo,
          label,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: pr.user?.login || "",
          draft: !!pr.draft,
          createdAt: pr.created_at,
          state,
        });
      }
    } catch (err) {
      error = `Could not read ${repo} from GitHub (${err.message}). Try Refresh in a minute.`;
    }
  }

  const value = { pulls, error };
  // Only a clean read is cached, so a GitHub hiccup is retried on the next load.
  if (!error) cache = { at: now, value };
  return value;
}

export function __resetPullsCache() {
  cache = { at: 0, value: null };
}
