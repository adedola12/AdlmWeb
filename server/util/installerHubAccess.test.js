// server/util/installerHubAccess.test.js
//
// R3: links sent outside a signed-in page (the purchase-approval email) point
// at the signed-in dashboard, whose Hub card shows only to a paid account.
import test from "node:test";
import assert from "node:assert/strict";
import { installerHubPageUrl, INSTALLER_HUB_PAGE } from "./installerHubAccess.js";

test("the Hub link is the signed-in dashboard, never a file", () => {
  assert.equal(INSTALLER_HUB_PAGE, "/dashboard");
  assert.equal(installerHubPageUrl("https://adlmstudio.net"), "https://adlmstudio.net/dashboard");
  assert.equal(installerHubPageUrl("https://adlmstudio.net//"), "https://adlmstudio.net/dashboard");
  assert.doesNotMatch(installerHubPageUrl("https://adlmstudio.net"), /r2\.dev|cloudinary|drive\.google|\.exe/);
});
