// infra/lambda/release-watch/gate.mjs
//
// The release-gate decision, kept apart from AWS so it can be tested: which
// commits landed on main since the last vetted one, and whether the release
// approver approved the pull request that landed each. `get` is the GitHub
// GET (JSON, null on 404) from index.mjs.

const MAX_WALK = 500; // first-parent steps; far more merges than land in an hour

/**
 * Every commit reachable from `head` but not from `last`, following the
 * compare endpoint's pages: one page stops at 250 commits, and a longer
 * backlog must not hide the oldest landings. null when `last` is gone
 * (history rewritten); the raw status otherwise.
 */
export async function newCommits(repo, last, head, get) {
  const commits = [];
  let status = "";
  for (let page = 1; page <= 20; page++) {
    const cmp = await get(`repos/${repo}/compare/${last}...${head}?per_page=100&page=${page}`);
    if (cmp === null) return null;
    status = cmp.status;
    if (status === "diverged" || status === "behind") return { status, commits: [] };
    const batch = cmp.commits || [];
    commits.push(...batch);
    if (!batch.length || commits.length >= (cmp.total_commits || 0)) break;
  }
  return { status, commits };
}

/**
 * What LANDED on main since `last`, oldest first: main's first-parent line
 * walked back from `head` while it is still new. A merge commit stands for
 * the pull request it merged, so the branch commits it carries are not
 * checked one by one. They were reviewed as part of that pull request.
 */
export function landedOnMain(head, commits) {
  const fresh = new Map(commits.map((c) => [c.sha, c]));
  const line = [];
  for (let sha = head, i = 0; sha && fresh.has(sha) && i < MAX_WALK; i++) {
    const c = fresh.get(sha);
    line.push(c);
    sha = c.parents?.[0]?.sha;
  }
  return line.reverse();
}

export async function approvedByApprover(repo, sha, approverLogin, get) {
  const pulls = (await get(`repos/${repo}/commits/${sha}/pulls`)) || [];
  const merged = pulls.filter((p) => p.merged_at && p.base?.ref === "main");
  for (const pr of merged) {
    const reviews = (await get(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`)) || [];
    const ok = reviews.some(
      (r) => r.state === "APPROVED" && String(r.user?.login || "").toLowerCase() === approverLogin.toLowerCase(),
    );
    if (ok) return { ok: true, pr: pr.number };
  }
  return { ok: false, pr: merged[0]?.number || null };
}
