// server/util/installerHubAccess.test.js
//
// R3: links sent outside a signed-in page (the purchase-approval email) point
// at the Downloads screen, where the paid-licence check runs on click.
import test from "node:test";
import assert from "node:assert/strict";
import { installerHubPageUrl, INSTALLER_HUB_PAGE } from "./installerHubAccess.js";

test("the Hub link is the signed-in Downloads screen, never a file", () => {
  assert.equal(INSTALLER_HUB_PAGE, "/manage/downloads");
  assert.equal(installerHubPageUrl("https://adlmstudio.net"), "https://adlmstudio.net/manage/downloads");
  assert.equal(installerHubPageUrl("https://adlmstudio.net//"), "https://adlmstudio.net/manage/downloads");
  assert.doesNotMatch(installerHubPageUrl("https://adlmstudio.net"), /r2\.dev|cloudinary|drive\.google|\.exe/);
});
