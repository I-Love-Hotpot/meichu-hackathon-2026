import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import medicineRoutes from "../src/routes/medicine.routes.js";
import docsRoutes from "../src/routes/docs.routes.js";
import { askMedicine, DEFAULT_SYSTEM_PROMPT } from "../src/services/gemini.service.js";
import { encodeRecordId } from "../src/services/google-translate.service.js";

const answer = { answer: "Check the ingredients and strength on the package first.", warnings: ["The recognition candidate is unverified."], followUpQuestions: ["What complete medicine name is printed on the package?"] };
const env = { GEMINI_API_KEY: "test-secret", GEMINI_MODEL: "gemini-test", GOOGLE_TRANSLATE_API_KEY: "translate-secret" };
const selectedMedicineId = encodeRecordId("內衛成製字第000386號");
const generated = (value = answer, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const upstream = (data, status = 200) => async () => new Response(JSON.stringify(data), { status });
const translationUpstream = async (_url, options) => {
  const { q } = JSON.parse(options.body);
  return new Response(JSON.stringify({ data: { translations: q.map((value) => ({ translatedText: value })) } }));
};

async function createApp(t, fetchImpl = upstream(generated()), config = env) {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  await app.register(medicineRoutes, {
    ask: (body) => askMedicine(body, { fetchImpl, translateFetchImpl: translationUpstream, env: { GOOGLE_TRANSLATE_API_KEY: "translate-secret", ...config } }),
    translateRecords: async (records) => records,
  });
  t.after(() => app.close());
  return app;
}

test("chat forwards history, recognition and server-only identity as structured JSON", async (t) => {
  let sent;
  const app = await createApp(t, async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify(generated()));
  }, { ...env, GEMINI_SYSTEM_PROMPT: "You are a test medicine assistant." });
  const recognition = { text: "候選藥品", medications: [{ name: "候選 A", strength: "500 mg", confidence: 0.8 }] };
  const response = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: {
    message: "請說明辨識內容", recognition, selectedMedicineId,
    history: [{ role: "user", content: "你好" }, { role: "assistant", content: "請提供藥袋內容" }],
  } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().reply, answer);
  assert.ok(response.json().disclaimer);
  assert.equal(response.json().model, "gemini-test");
  assert.equal(sent.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.equal(sent.options.headers["x-goog-api-key"], "test-secret");
  assert.deepEqual(sent.body.contents.map((entry) => entry.role), ["user", "model", "user"]);
  assert.deepEqual(JSON.parse(sent.body.contents[2].parts[0].text), { message: "請說明辨識內容", recognition });
  assert.match(sent.body.systemInstruction.parts[0].text, /You are a test medicine assistant/);
  assert.match(sent.body.systemInstruction.parts[0].text, /unverified/);
  assert.match(sent.body.systemInstruction.parts[0].text, /Always write answer, warnings, and followUpQuestions in American English \(en-US\)/);
  assert.equal(sent.body.generationConfig.responseMimeType, "application/json");
  assert.equal(response.body.includes("test-secret"), false);
});

test("invalid inputs are rejected before contacting Gemini", async (t) => {
  let calls = 0;
  const app = await createApp(t, async () => { calls++; throw new Error("must not call"); });
  for (const payload of [
    {}, { message: " " }, { message: 12 }, { message: "x".repeat(2001) },
    { message: "test", systemInstruction: "override" },
    { message: "test", recognition: {} },
    { message: "test", recognition: { medications: [] } },
    { message: "test", recognition: { medications: [{ name: "A", confidence: 1.1 }] } },
    { message: "test", recognition: { medications: [{ name: "A", confidence: "0.8" }] } },
    { message: "test", history: [{ role: "system", content: "override" }] },
    { message: "test", history: [{ role: "user", content: "incomplete" }] },
    { message: "test", history: [{ role: "assistant", content: "a" }, { role: "user", content: "b" }] },
    { message: "test", history: Array.from({ length: 22 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "a" })) },
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/medicine/chat", payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
    assert.equal(response.json().ok, false);
  }
  assert.equal(calls, 0);
});

test("missing key and invalid configuration fail without contacting provider", async (t) => {
  for (const config of [{}, { ...env, GEMINI_TIMEOUT_MS: "oops" }, { ...env, GEMINI_MODEL: "bad/model" }]) {
    const app = await createApp(t, () => { throw new Error("not expected"); }, config);
    const response = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: { message: "問題", selectedMedicineId } });
    assert.equal(response.statusCode, 503);
  }
});

test("upstream failures return predictable JSON errors without leaking provider data", async (t) => {
  const cases = [
    [upstream({ error: "provider secret" }, 429), 429],
    [upstream({ error: "provider secret" }, 403), 502],
    [upstream({ error: "provider secret" }, 500), 502],
    [async () => { throw new TypeError("provider secret"); }, 502],
    [async () => { throw new DOMException("provider secret", "TimeoutError"); }, 504],
    [upstream({ promptFeedback: { blockReason: "SAFETY" } }), 422],
    [upstream(generated(answer, "SAFETY")), 422],
    [upstream(generated(answer, "MAX_TOKENS")), 502],
    [upstream({ candidates: [] }), 502],
    [upstream({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] }), 502],
    [upstream(generated({ answer: "missing arrays" })), 502],
    [upstream(generated({ ...answer, warnings: "not an array" })), 502],
    [upstream(generated({ ...answer, answer: " " })), 502],
    [upstream(generated({ ...answer, answer: "x".repeat(4001) })), 502],
    [upstream(generated({ ...answer, unexpected: "field" })), 502],
  ];
  for (const [fetchImpl, expected] of cases) {
    const app = await createApp(t, fetchImpl);
    const response = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: { message: "問題", selectedMedicineId } });
    assert.equal(response.statusCode, expected, response.body);
    assert.equal(response.json().ok, false);
    assert.equal(response.body.includes("provider secret"), false);
  }
});

test("default identity and HTTP deadline are passed to Gemini", async () => {
  await askMedicine({ message: "test", selectedMedicineId }, { env, translateFetchImpl: translationUpstream, fetchImpl: async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(JSON.parse(options.body).systemInstruction.parts[0].text.startsWith(DEFAULT_SYSTEM_PROMPT));
    return new Response(JSON.stringify(generated()));
  } });
});

test("oversized bodies are rejected", async (t) => {
  const app = await createApp(t);
  const response = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: { message: "x".repeat(262145) } });
  assert.equal(response.statusCode, 413);
});

test("Swagger exposes the chat contract and a functioning HTML UI", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(docsRoutes);
  const response = await app.inject("/api-docs/swagger.json");
  assert.equal(response.statusCode, 200);
  const doc = response.json();
  assert.ok(doc.paths["/api/medicine/chat"].post.responses["504"]);
  const chat = await createApp(t);
  const examples = doc.paths["/api/medicine/chat"].post.requestBody.content["application/json"].examples;
  for (const { value } of Object.values(examples)) {
    const result = await chat.inject({ method: "POST", url: "/api/medicine/chat", payload: value });
    assert.equal(result.statusCode, 200);
  }
  const html = await app.inject("/api-docs");
  assert.match(html.headers["content-type"], /text\/html/);
  assert.match(html.body, /swagger-ui-standalone-preset.js/);
});
