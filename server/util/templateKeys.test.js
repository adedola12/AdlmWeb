import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadTemplateKeys, resolveTemplateKey, templateRegistry, keyIdOf } from "./templateKeys.js";

const key = crypto.randomBytes(32);
const kid = keyIdOf(key);
const quiet = { error: () => {} };
const env = { TEMPLATE_CONTENT_KEYS: JSON.stringify({ "civil-works": { [kid]: key.toString("base64") } }) };

test("loads a key whose id matches its hash", () => {
  const keys = loadTemplateKeys(env, quiet);
  assert.deepEqual(keys["civil-works"][kid], key);
});

test("drops a key pasted under the wrong id, and bad JSON loads nothing", () => {
  const wrong = { TEMPLATE_CONTENT_KEYS: JSON.stringify({ "civil-works": { "0000000000000000": key.toString("base64") } }) };
  assert.deepEqual(loadTemplateKeys(wrong, quiet), {});
  assert.deepEqual(loadTemplateKeys({ TEMPLATE_CONTENT_KEYS: "{nope" }, quiet), {});
  assert.deepEqual(loadTemplateKeys({}, quiet), {});
});

test("returns the key for a known template and version", () => {
  const r = resolveTemplateKey("civil-works", kid, loadTemplateKeys(env, quiet));
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.body.key, "base64").length, 32);
  assert.equal(r.body.kid, kid);
});

test("unknown template 404, missing kid 400, withdrawn version 404, unconfigured 503", () => {
  const keys = loadTemplateKeys(env, quiet);
  assert.equal(resolveTemplateKey("heron", kid, keys).status, 404);
  assert.equal(resolveTemplateKey("civil-works", "", keys).status, 400);
  assert.equal(resolveTemplateKey("civil-works", "../../etc", keys).status, 400);
  assert.equal(resolveTemplateKey("civil-works", "ffffffffffffffff", keys).status, 404);
  assert.equal(resolveTemplateKey("civil-works", kid, {}).status, 503);
});

test("the civil template belongs to CIVIQ's licence until the owner moves it", () => {
  assert.equal(templateRegistry({})["civil-works"].productKey, "civil3d");
  assert.equal(templateRegistry({ CIVIL_TEMPLATE_PRODUCT_KEY: "CIVIL-PS" })["civil-works"].productKey, "civil-ps");
});
