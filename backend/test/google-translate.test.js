import test from "node:test";
import assert from "node:assert/strict";
import { clearTranslationCache, decodeRecordId, encodeRecordId, translateMedicineRecords, translateToEnglish } from "../src/services/google-translate.service.js";

const env = { GOOGLE_TRANSLATE_API_KEY: "translate-test-key", GOOGLE_TRANSLATE_TIMEOUT_MS: "5000" };

test("Google Translation Basic v2 receives private credentials and translates batches to English", async () => {
  clearTranslationCache();
  let request;
  const result = await translateToEnglish(["白", "圓形", "white"], { env, fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ data: { translations: [{ translatedText: "White" }, { translatedText: "Round" }] } }));
  } });
  assert.equal(request.url, "https://translation.googleapis.com/language/translate/v2");
  assert.equal(request.options.headers["x-goog-api-key"], "translate-test-key");
  assert.deepEqual(request.body, { q: ["白", "圓形"], source: "zh-TW", target: "en", format: "text" });
  assert.equal(result.get("白"), "White");
  assert.equal(result.has("white"), false);
});

test("translated medicine records contain English display fields and preserve an opaque record ID", async () => {
  clearTranslationCache();
  const input = [{ licenseNumber: "許可證一", chineseName: "測試藥", englishName: "TEST TABLET", shape: "圓形", dosageForm: "", color: "白", odor: "", scoreLine: "無", size: "8", imprint1: "ABC", imprint2: "", imageUrl: "https://example.test/a" }];
  const dictionary = { "許可證一": "License One", "測試藥": "Test Medicine", "圓形": "Round", "白": "White", "無": "None" };
  const result = await translateMedicineRecords(input, { env, fetchImpl: async (_url, options) => {
    const { q } = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { translations: q.map((value) => ({ translatedText: dictionary[value] })) } }));
  } });
  const { chineseName: _unused, ...sourceWithoutChineseName } = input[0];
  assert.deepEqual(result[0], { ...sourceWithoutChineseName, recordId: encodeRecordId("許可證一"), licenseNumber: "License One", displayName: "TEST TABLET", shape: "Round", color: "White", scoreLine: "None" });
  assert.equal("chineseName" in result[0], false);
  assert.equal(decodeRecordId(result[0].recordId), "許可證一");
  assert.equal(decodeRecordId("invalid"), "invalid");
});

test("translation cache avoids repeat requests", async () => {
  clearTranslationCache();
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    const { q } = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: { translations: q.map(() => ({ translatedText: "White" })) } }));
  };
  await translateToEnglish(["白"], { env, fetchImpl });
  await translateToEnglish(["白"], { env, fetchImpl });
  assert.equal(calls, 1);
});

test("translation configuration, quota, timeout, provider and malformed responses are mapped safely", async () => {
  clearTranslationCache();
  await assert.rejects(() => translateToEnglish(["紅"], { env: {} }), { statusCode: 503 });
  await assert.rejects(() => translateToEnglish(["紅"], { env: { ...env, GOOGLE_TRANSLATE_TIMEOUT_MS: "bad" } }), { statusCode: 503 });
  await assert.rejects(() => translateToEnglish(["紅"], { env, fetchImpl: async () => new Response("{}", { status: 429 }) }), { statusCode: 429 });
  await assert.rejects(() => translateToEnglish(["紅"], { env, fetchImpl: async () => new Response("{}", { status: 500 }) }), { statusCode: 502 });
  await assert.rejects(() => translateToEnglish(["紅"], { env, fetchImpl: async () => { throw new DOMException("timeout", "TimeoutError"); } }), { statusCode: 504 });
  await assert.rejects(() => translateToEnglish(["紅"], { env, fetchImpl: async () => new Response(JSON.stringify({ data: { translations: [] } })) }), { statusCode: 502 });
});
