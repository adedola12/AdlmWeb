// The one edit that would spin every customer's dashboard forever.
//
// main.jsx carries an instruction for go-live: restore /dashboard as a redirect
// to /manage, and switch lib/afterSignIn.js to "/manage". If either lands while
// GATE_NEW_BUILD is still true, a customer's home becomes an infinite loop:
//
//   /dashboard -> <Navigate to="/manage"> -> NewBuildGate -> /dashboard -> ...
//
// Prose in a comment has not been enough before. afterSignIn.js records that the
// same instruction was ignored TWICE — the 15 September release switched it early
// and customers lost their dashboard, and PR #24 switched it again six days
// before go-live, so every sign-in landed on a screen the person had never seen.
//
// So the two facts are tied together here instead: whatever state the router is
// in, the gate has to agree with it.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GATE_NEW_BUILD } from "./NewBuildGate.jsx";
import { AFTER_SIGN_IN } from "../lib/afterSignIn.js";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROUTER = fs.readFileSync(path.join(here, "..", "main.jsx"), "utf8");

// The element of the route declared as `path: "dashboard"`, as source text.
function dashboardElement() {
  const at = ROUTER.indexOf('path: "dashboard"');
  expect(at, 'main.jsx no longer declares path: "dashboard"').toBeGreaterThan(-1);
  // The route object ends at the next line that is exactly six spaces and "},".
  const rest = ROUTER.slice(at);
  const end = rest.search(/\r?\n {6}\},/);
  return rest.slice(0, end === -1 ? 400 : end);
}

describe("go-live cannot be half done", () => {
  it("does not redirect /dashboard into the new build while the gate is up", () => {
    const el = dashboardElement();
    const redirectsToManage = /<Navigate[^>]*to=\{?["'`]\/manage/.test(el);
    if (GATE_NEW_BUILD) {
      expect(
        redirectsToManage,
        'GATE_NEW_BUILD is true, so /dashboard must NOT redirect to /manage — ' +
          'that is an infinite loop for every customer. Flip GATE_NEW_BUILD to ' +
          "false in the same commit that restores the redirect.",
      ).toBe(false);
    }
  });

  it("does not send sign-in into the new build while the gate is up", () => {
    if (GATE_NEW_BUILD) {
      expect(
        AFTER_SIGN_IN.startsWith("/manage"),
        'GATE_NEW_BUILD is true, so AFTER_SIGN_IN must not be "/manage": every ' +
          "sign-in would bounce straight back out to the classic dashboard. " +
          "Flip the gate in the same commit.",
      ).toBe(false);
    }
  });

  it("has taken the gate down if the router has gone over to the new build", () => {
    // The other direction: the redirect is back and the gate was forgotten.
    const el = dashboardElement();
    if (/<Navigate[^>]*to=\{?["'`]\/manage/.test(el)) {
      expect(
        GATE_NEW_BUILD,
        "/dashboard now redirects to /manage, so the gate must be off.",
      ).toBe(false);
    }
  });

  it("agrees with afterSignIn once the gate is down", () => {
    // Not a hard requirement the other way round — the gate can come off before
    // sign-in is moved — so this only records the pairing rather than failing a
    // deliberate two-step. It fails only if the gate is DOWN and /dashboard still
    // does not exist as a real screen, which would leave nowhere to land.
    if (!GATE_NEW_BUILD) {
      expect(ROUTER).toContain('path: "dashboard"');
    }
  });
});
