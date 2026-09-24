import test from "node:test";
import assert from "node:assert/strict";
import { toWhatsAppNumber, whatsappEnabled, codeMessage, sendWhatsAppCode, hashWaCode } from "./whatsappVerify.js";

test("numbers become full international digits", () => {
  assert.equal(toWhatsAppNumber("0803 000 0000"), "2348030000000");
  assert.equal(toWhatsAppNumber("+234 803 000 0000"), "2348030000000");
  assert.equal(toWhatsAppNumber("2348030000000"), "2348030000000");
  assert.equal(toWhatsAppNumber("+44 7700 900123"), "447700900123");
  assert.equal(toWhatsAppNumber("0044 7700 900123"), "447700900123");
  assert.equal(toWhatsAppNumber("12345"), null);
  assert.equal(toWhatsAppNumber(""), null);
});

test("off until all three settings exist", () => {
  assert.equal(whatsappEnabled({}), false);
  assert.equal(whatsappEnabled({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" }), false);
  assert.equal(whatsappEnabled({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TEMPLATE: "x" }), true);
});

test("the message is an authentication template carrying the code twice", () => {
  const m = codeMessage("2348030000000", "123456", { WHATSAPP_TEMPLATE: "adlm_code" });
  assert.equal(m.template.name, "adlm_code");
  assert.equal(m.template.language.code, "en");
  assert.equal(m.template.components[0].parameters[0].text, "123456");
  assert.equal(m.template.components[1].sub_type, "url");
});

test("a refused send says why", async () => {
  const env = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TEMPLATE: "x" };
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "bad number" } }) });
  await assert.rejects(sendWhatsAppCode("1", "123456", { env, fetchImpl }), /\(400\): bad number/);
});

test("codes are stored hashed, not plain", () => {
  assert.notEqual(hashWaCode("123456"), "123456");
  assert.equal(hashWaCode("123456"), hashWaCode("123456"));
});
