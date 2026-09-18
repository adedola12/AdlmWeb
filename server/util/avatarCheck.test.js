import test from "node:test";
import assert from "node:assert/strict";
import { avatarPublicId, judgeAvatar, checkAvatarUrl, AVATAR_ERRORS } from "./avatarCheck.js";

const cloudName = "dirgfivvb";
const url = (p) => `https://res.cloudinary.com/${cloudName}/image/upload/v1726/${p}`;
const face = [[10, 10, 80, 80]];

test("only images in our own avatars folder count", () => {
  assert.equal(avatarPublicId(url("adlm/avatars/abc.jpg"), { cloudName }), "adlm/avatars/abc");
  assert.equal(avatarPublicId(url("adlm/previews/abc.jpg"), { cloudName }), null);
  assert.equal(avatarPublicId("https://example.com/me.jpg", { cloudName }), null);
  assert.equal(avatarPublicId(`https://res.cloudinary.com/other/image/upload/adlm/avatars/a.jpg`, { cloudName }), null);
  assert.equal(avatarPublicId("not a url", { cloudName }), null);
});

test("a square photo with a face passes", () => {
  assert.equal(judgeAvatar({ width: 800, height: 800, faces: face }), null);
  assert.equal(judgeAvatar({ width: 800, height: 790, faces: face }), null, "within 2%");
});

test("a photo that is not square is refused, with its size", () => {
  const msg = judgeAvatar({ width: 1200, height: 800, faces: face });
  assert.match(msg, /must be square/);
  assert.match(msg, /1200 × 800/);
});

test("a tiny photo is refused", () => {
  assert.match(judgeAvatar({ width: 120, height: 120, faces: face }), /at least 200/);
});

test("a photo with no face is refused", () => {
  assert.equal(judgeAvatar({ width: 600, height: 600, faces: [] }), AVATAR_ERRORS.noFace);
  assert.equal(judgeAvatar({ width: 600, height: 600 }), AVATAR_ERRORS.noFace);
});

test("the whole check, with the lookup injected", async () => {
  const ok = async () => ({ width: 500, height: 500, faces: face });
  assert.equal(await checkAvatarUrl(url("adlm/avatars/x.png"), { cloudName, lookup: ok }), null);
  assert.equal(await checkAvatarUrl("https://evil.example/x.png", { cloudName, lookup: ok }), AVATAR_ERRORS.notOurs);
  const down = async () => {
    throw new Error("503");
  };
  assert.equal(await checkAvatarUrl(url("adlm/avatars/x.png"), { cloudName, lookup: down }), AVATAR_ERRORS.unchecked);
});
