#!/usr/bin/env node
// client/scripts/check-render-safety.mjs
//
// Fails the build when a file uses a name nothing defines — the one class of
// mistake that takes the whole site down rather than breaking one screen.
//
// WHY THIS EXISTS
// On 27 Sep 2026 the live site was down from 08:33 to 14:39 WAT. PR #22 added
//
//     { path: "admin/work", element: <AdminRoute…><AdminWork /></AdminRoute> }
//
// to main.jsx's route table and lost the matching import in a branch merge.
// The route table is built while main.jsx loads, so EVERY page threw
// "AdminWork is not defined" before React started: blank sign-in, blank
// dashboard. It was the second time — 4e7acca took the dashboard down the same
// way with <Seo>.
//
// Nothing caught it:
//   - `vite build` resolves imports, not identifiers. A free identifier is
//     left as a global lookup and the build passes, so Vercel published it.
//   - The ESLint config has had `react/jsx-no-undef` on since the <Seo>
//     incident, and it reports this in one line. But `npm run lint` is not in
//     the build or in CI, and it prints 41 other errors (unused variables,
//     fast-refresh warnings) that nobody has cleaned up, so it does not get
//     run.
//
// So this check runs ESLint itself, over the same files, with only the fatal
// rules turned on:
//
//     react/jsx-no-undef   <Thing /> where nothing defines Thing
//     no-undef             thing() where nothing defines thing
//
// It is in `prebuild`, which means `npm run build` fails, which means the
// VERCEL build fails and a broken bundle is never published. It is in CI too,
// on every pull request, so it is seen before the merge rather than after.
//
// It deliberately does NOT enforce the noisy rules. This gate has to stay at
// zero to be worth anything; cleaning up the other 41 errors is separate work
// that must not be able to break the build.
import { ESLint } from "eslint";

const FATAL = {
  "react/jsx-no-undef": "error",
  "no-undef": "error",
};

const eslint = new ESLint({
  // The project config still applies (parser, plugins, ignores). This only
  // changes severities: the fatal rules on, everything else off, so one
  // unused variable can never fail a deploy.
  overrideConfig: [{ rules: FATAL }],
  ruleFilter: ({ ruleId }) => Object.hasOwn(FATAL, ruleId),
});

const results = await eslint.lintFiles(["src", "api", "middleware.js", "*.js"]);
const bad = results.filter((r) => r.errorCount > 0);

if (!bad.length) {
  const n = results.length;
  console.log(`render safety: ${n} files, no undefined names.`);
  process.exit(0);
}

console.error("\nrender safety FAILED. A name is used that nothing defines.\n");
for (const file of bad) {
  for (const m of file.messages) {
    if (m.severity !== 2) continue;
    console.error(`  ${file.filePath}:${m.line}:${m.column}  ${m.message}  (${m.ruleId})`);
  }
}
console.error(
  "\nThis would throw at load and blank the page, so the build stops here.\n" +
    "Usually the import line is missing. Add it, or delete the use.\n",
);
process.exit(1);
