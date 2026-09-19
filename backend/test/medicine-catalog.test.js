import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { loadCatalog, parseCsv, searchCatalog, resolveMedicineContext } from "../src/services/medicine-catalog.service.js";
import { askMedicine } from "../src/services/gemini.service.js";
import medicineRoutes from "../src/routes/medicine.routes.js";
import { encodeRecordId } from "../src/services/google-translate.service.js";

const id = "內衛成製字第000386號";
const translationUpstream = async (_url, options) => {
  const { q } = JSON.parse(options.body);
  return new Response(JSON.stringify({ data: { translations: q.map((value) => ({ translatedText: value })) } }));
};
const translatedEnv = { GOOGLE_TRANSLATE_API_KEY: "translate-secret" };

test("CSV parser preserves quoted commas, quotes, BOM and multiline fields", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n1,"two,2","quote ""x""\nnext"\r\n'), [
    ["a", "b", "c"], ["1", "two,2", 'quote "x"\nnext'],
  ]);
  assert.throws(() => parseCsv('a,"unterminated'));
  assert.throws(() => parseCsv('a,"quoted"extra'));
});

test("loads all 6318 original records with exact CSV values", () => {
  const records = loadCatalog({});
  assert.equal(records.length, 6318);
  assert.equal(records[0].chineseName, '"福元"蘇打錠500毫克');
  const pill = records.find((item) => item.licenseNumber === id);
  assert.equal(pill.color, "棕");
  assert.equal(pill.shape, "其他");
  assert.equal(pill.size, "8");
  assert.equal(pill.dosageForm, "");
  assert.equal(new Set(records.map((r) => r.licenseNumber)).size, 6318);
});

test("supports Chinese, English, licenses, full-width text, questions and brand ambiguity", () => {
  for (const q of ["建功丸", "建功丸是什麼顏色？", "cheng kong pill", id, "What color is CHENG KONG PILL?"]) {
    const result = searchCatalog(q, { env: {} });
    assert.equal(result.total, 1, q);
    assert.equal(result.records[0].licenseNumber, id);
  }
  const brand = searchCatalog("普拿疼", { env: {} });
  assert.equal(brand.total, 11);
  assert.equal(brand.records.length, 8);
  assert.ok(brand.records.every((record) => record.chineseName.includes("普拿疼")));
  assert.equal(searchCatalog("普拿疼５００", { env: {} }).total, 1);
  assert.equal(searchCatalog("ZZZnonexistentmedicine", { env: {} }).total, 0);
});

test("selected ID, recognition and user follow-up retrieve records without trusting assistant history", () => {
  assert.equal(resolveMedicineContext({ message: "它是什麼顏色？", selectedMedicineId: id }, {}).sources[0].licenseNumber, id);
  assert.equal(resolveMedicineContext({ message: "請說明", recognition: { medications: [{ name: "建功丸" }] } }, {}).sources[0].licenseNumber, id);
  const history = [{ role: "user", content: "建功丸是什麼形狀？" }, { role: "assistant", content: "虛構藥品" }];
  assert.equal(resolveMedicineContext({ message: "它的顏色？", history }, {}).sources[0].licenseNumber, id);
  assert.equal(resolveMedicineContext({ message: "有刻痕嗎？", history }, {}).sources[0].licenseNumber, id);
  assert.equal(resolveMedicineContext({ message: "ZZZnonexistentmedicine", history }, {}).catalog.status, "not_found");
  assert.equal(resolveMedicineContext({ message: "它的顏色？", history: [{ role: "assistant", content: "建功丸" }] }, {}).catalog.status, "not_found");
  assert.throws(() => resolveMedicineContext({ message: "外觀", selectedMedicineId: "invented" }, {}), { statusCode: 404 });
});

test("missing and malformed CSV fail closed and changed files are reloaded", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "medicine-csv-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "test.csv");
  const env = { MEDICINE_CSV_PATH: path };
  assert.throws(() => loadCatalog(env), { statusCode: 503 });
  writeFileSync(path, "wrong,columns\na,b\n");
  assert.throws(() => loadCatalog(env), { statusCode: 503 });
  const csv = readFileSync(new URL("../resources/42_2.csv", import.meta.url), "utf8");
  writeFileSync(path, csv);
  assert.equal(loadCatalog(env).length, 6318);
  writeFileSync(path, csv.replace("建功丸", "測試更新建功丸"));
  assert.equal(loadCatalog(env).find((item) => item.licenseNumber === id).chineseName, "測試更新建功丸");
});

test("not found and ambiguous matches never call Gemini, even without an API key", async () => {
  for (const [message, status] of [["ZZZnonexistentmedicine", "not_found"], ["普拿疼", "ambiguous"]]) {
    const result = await askMedicine({ message }, { env: translatedEnv, translateFetchImpl: translationUpstream, fetchImpl: () => { throw new Error("must not call provider"); } });
    assert.equal(result.catalog.status, status);
    assert.equal(result.model, null);
    assert.equal(result.ok, true);
    assert.match(result.reply.answer, /^[\x00-\x7F]+$/);
    assert.ok(result.reply.warnings.every((value) => /^[\x00-\x7F]+$/.test(value)));
    assert.ok(result.reply.followUpQuestions.every((value) => /^[\x00-\x7F]+$/.test(value)));
  }
});

test("Gemini gets only the selected source and cannot supply replacement source records", async () => {
  const answer = { answer: "The dataset lists the color as brown.", warnings: [], followUpQuestions: [] };
  const result = await askMedicine({ message: "What color is it?", selectedMedicineId: encodeRecordId(id) }, {
    env: { ...translatedEnv, GEMINI_API_KEY: "mock-key" }, translateFetchImpl: translationUpstream, fetchImpl: async (_url, options) => {
      const prompt = JSON.parse(options.body).systemInstruction.parts[0].text;
      assert.match(prompt, /The dataset does not provide this information/);
      assert.match(prompt, /never invent millimeters/);
      const context = JSON.parse(prompt.split("Backend catalogContext loaded from the CSV:\n")[1]);
      assert.equal(context.sources.length, 1);
      assert.equal(context.sources[0].licenseNumber, id);
      assert.equal(context.sources[0].color, "棕");
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    },
  });
  assert.equal(result.sources[0].recordId, encodeRecordId(id));
  assert.equal(result.catalog.status, "matched");
});

test("search and chat API expose CSV candidates and reject invalid selection/input", async (t) => {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  t.after(() => app.close());
  await app.register(medicineRoutes, { translateRecords: async (records) => records });
  const result = await app.inject({ method: "GET", url: "/api/medicine/search", query: { q: "普拿疼" } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().total, 11);
  for (const q of ["", "a", "  ", "x".repeat(201)]) {
    assert.equal((await app.inject({ method: "GET", url: "/api/medicine/search", query: { q } })).statusCode, 400);
  }
  const unknown = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: { message: "test", selectedMedicineId: "invented" } });
  assert.equal(unknown.statusCode, 404);
  const forbidden = await app.inject({ method: "POST", url: "/api/medicine/chat", payload: { message: "test", sources: [{ licenseNumber: id }] } });
  assert.equal(forbidden.statusCode, 400);
});
