// A tripwire on one constant, because changing it early has now cost
// customers their dashboard twice.
//
// AFTER_SIGN_IN decides where a signed-in person lands. Pointing it at
// /manage is the right move ON 1 OCTOBER and wrong before it: the 15
// September release made that change early, and the launch build made it
// again — PR #24 merged on 24 September, so for two days every sign-in
// arrived on a screen the person had never seen.
//
// This test is meant to fail on 1 October. When the new build goes live,
// change the constant, change the /dashboard route in main.jsx back to a
// redirect, and update this file — all three together, deliberately. A
// failing test here is the question "is it actually launch day yet?".

import { describe, it, expect } from "vitest";
import { AFTER_SIGN_IN } from "./afterSignIn.js";

describe("where a signed-in customer lands", () => {
  it("is home, not the new overview, until the new build goes live", () => {
    expect(AFTER_SIGN_IN).toBe("/");
  });

  it("is never /manage while /dashboard is the screen customers know", () => {
    expect(AFTER_SIGN_IN).not.toBe("/manage");
  });
});
