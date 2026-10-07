// A tripwire on one constant, because changing it at the wrong moment has now
// cost customers their dashboard twice.
//
// AFTER_SIGN_IN decides where a signed-in person lands. Pointing it at /manage
// was the right move ON 1 OCTOBER and wrong before it: the 15 September release
// made that change early, and the launch build made it again — PR #24 merged on
// 24 September, so for two days every sign-in arrived on a screen the person had
// never seen.
//
// Go-live happened on 1 October 2026, so the tripwire now points the other way.
// It is not a date check — it is the pairing. Moving this constant back to "/"
// without also putting the classic screens back is the same half-done change in
// the opposite direction, and newBuildGate.golive.test.js holds the rest of it.

import { describe, it, expect } from "vitest";
import { AFTER_SIGN_IN } from "./afterSignIn.js";
import { GATE_NEW_BUILD } from "./newBuildAccess.js";

describe("where a signed-in customer lands", () => {
  it("is the Manage overview, now that the new build is the build", () => {
    expect(AFTER_SIGN_IN).toBe("/manage");
  });

  it("never sends sign-in somewhere the new-build gate would bounce it back from", () => {
    // The loop that newBuildGate.golive.test.js describes, stated from this
    // side: if the gate is ever raised again, landing sign-in on /manage sends
    // every customer straight back out to /dashboard — which redirects to
    // /manage. One of the two has to give.
    if (GATE_NEW_BUILD) {
      expect(
        AFTER_SIGN_IN.startsWith("/manage"),
        "GATE_NEW_BUILD is true again, so AFTER_SIGN_IN cannot be /manage — " +
          "put it back to \"/\" in the same commit that raises the gate.",
      ).toBe(false);
    }
  });
});
