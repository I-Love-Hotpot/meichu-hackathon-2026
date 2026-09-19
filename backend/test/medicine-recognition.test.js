import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import medicineRoutes from "../src/routes/medicine.routes.js";
import { MedicineChatError } from "../src/services/medicine-error.js";
import {
  MAX_RECOGNITION_IMAGE_BYTES,
  matchRecognitionEvidence,
  recognizeMedicineImage,
} from "../src/services/medicine-recognition.service.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const env = {
  GEMINI_API_KEY: "recognition-secret",
  GEMINI_MODEL: "gemini-vision-test",
  GEMINI_TIMEOUT_MS: "5000",
  GOOGLE_TRANSLATE_API_KEY: "translation-secret",
};
const evidence = {
  text: "SODIUM BICARBONATE TABLETS F.Y. 500 mg FY T061",
  medications: [
    { name: "SODIUM BICARBONATE TABLETS F.Y.", strength: "500 mg" },
  ],
  pills: [{ imprint: "FY T061", color: "white", shape: "round" }],
};
const sourceRecord = {
  licenseNumber: "內衛成製字第000075號",
  chineseName: '"福元"蘇打錠500毫克',
  englishName: 'SODIUM BICARBONATE TABLETS "F.Y."',
  shape: "圓形",
  dosageForm: "",
  color: "白",
  odor: "",
  scoreLine: "無",
  size: "8",
  imprint1: "FY T061",
  imprint2: "",
  imageUrl: "https://example.test/pill.jpg",
};
const translatedRecord = {
  recordId: "med_test",
  licenseNumber: "License 000075",
  displayName: sourceRecord.englishName,
  englishName: sourceRecord.englishName,
  shape: "Round",
  dosageForm: "",
  color: "White",
  odor: "",
  scoreLine: "None",
  size: "8",
  imprint1: "FY T061",
  imprint2: "",
  imageUrl: sourceRecord.imageUrl,
};

const generated = (value = evidence, finishReason = "STOP") => ({
  candidates: [
    {
      finishReason,
      content: { parts: [{ text: JSON.stringify(value) }] },
    },
  ],
});

const upstream = (data, status = 200) => async () =>
  new Response(JSON.stringify(data), { status });

test("recognition sends raw image evidence to Gemini without asking it to identify a medicine", async () => {
  let request;
  const result = await recognizeMedicineImage(
    { image: jpeg, mediaType: "image/jpeg" },
    {
      env,
      fetchImpl: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) };
        return new Response(JSON.stringify(generated()));
      },
      search: () => ({
        records: [sourceRecord],
        total: 1,
        recordCount: 6318,
      }),
      load: () => [sourceRecord],
      translateRecords: async (records, options) => {
        assert.deepEqual(records, [sourceRecord]);
        assert.equal(options.env, env);
        return [translatedRecord];
      },
    },
  );

  assert.equal(
    request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-vision-test:generateContent",
  );
  assert.equal(request.options.headers["x-goog-api-key"], "recognition-secret");
  assert.match(
    request.body.systemInstruction.parts[0].text,
    /not a medicine identification system/i,
  );
  assert.match(request.body.systemInstruction.parts[0].text, /Never identify/);
  assert.deepEqual(request.body.contents[0].parts[1].inlineData, {
    mimeType: "image/jpeg",
    data: jpeg.toString("base64"),
  });
  assert.equal(
    request.body.generationConfig.responseMimeType,
    "application/json",
  );
  assert.equal(result.matchStrategy, "name");
  assert.deepEqual(result.recognition, evidence);
  assert.deepEqual(result.records, [translatedRecord]);
  assert.equal(result.total, 1);
  assert.equal(result.recordCount, 6318);
  assert.equal(result.source, "42_2.csv");
  assert.equal(JSON.stringify(request.body).includes("recognition-secret"), false);
});

test("deterministic matching prefers names, then OCR text, then exact normalized imprints", () => {
  const nameSearches = [];
  const nameResult = matchRecognitionEvidence(evidence, {
    search: (query) => {
      nameSearches.push(query);
      return { records: [sourceRecord], total: 1, recordCount: 3 };
    },
    load: () => assert.fail("name evidence must not scan appearance fields"),
  });
  assert.equal(nameResult.strategy, "name");
  assert.deepEqual(nameSearches, ["SODIUM BICARBONATE TABLETS F.Y. 500 mg"]);

  const textResult = matchRecognitionEvidence(
    { text: "visible package name", medications: [], pills: [] },
    {
      search: (query) => {
        assert.equal(query, "visible package name");
        return { records: [sourceRecord], total: 1, recordCount: 3 };
      },
    },
  );
  assert.equal(textResult.strategy, "text");

  const catalog = [
    sourceRecord,
    { ...sourceRecord, licenseNumber: "other", imprint1: "OTHER" },
  ];
  const appearanceResult = matchRecognitionEvidence(
    {
      text: "",
      medications: [],
      pills: [{ imprint: "fy-t061", color: "white", shape: "round" }],
    },
    { search: () => assert.fail("empty text must not be searched"), load: () => catalog },
  );
  assert.equal(appearanceResult.strategy, "imprint");
  assert.deepEqual(appearanceResult.records, [sourceRecord]);
  assert.equal(appearanceResult.total, 1);
});

test("appearance without a visible imprint never selects a medicine", () => {
  const result = matchRecognitionEvidence(
    {
      text: "",
      medications: [],
      pills: [{ imprint: "", color: "white", shape: "round" }],
    },
    {
      search: () => assert.fail("empty text must not be searched"),
      load: () => [sourceRecord],
    },
  );
  assert.deepEqual(result, {
    strategy: "none",
    records: [],
    total: 0,
    recordCount: 1,
  });
});

test("an ungrounded model-supplied medicine name is never used as identification", () => {
  const result = matchRecognitionEvidence(
    {
      text: "",
      medications: [{ name: "invented medicine from appearance" }],
      pills: [{ imprint: "", color: "white", shape: "round" }],
    },
    {
      search: () =>
        assert.fail("a name absent from visible OCR must not be searched"),
      load: () => [sourceRecord],
    },
  );
  assert.deepEqual(result, {
    strategy: "none",
    records: [],
    total: 0,
    recordCount: 1,
  });
});

test("recognition validates bytes and maps provider failures without leaking data", async () => {
  const base = { image: jpeg, mediaType: "image/jpeg" };
  const cases = [
    [{ env: {} }, 503],
    [{ env, fetchImpl: upstream({ error: "provider secret" }, 429) }, 429],
    [{ env, fetchImpl: upstream({ error: "provider secret" }, 500) }, 502],
    [
      {
        env,
        fetchImpl: async () => {
          throw new DOMException("provider secret", "TimeoutError");
        },
      },
      504,
    ],
    [{ env, fetchImpl: upstream({ promptFeedback: { blockReason: "SAFETY" } }) }, 422],
    [{ env, fetchImpl: upstream(generated(evidence, "MAX_TOKENS")) }, 502],
    [{ env, fetchImpl: upstream(generated({ guessedMedicine: "secret" })) }, 502],
  ];

  for (const [options, statusCode] of cases) {
    await assert.rejects(
      () => recognizeMedicineImage(base, options),
      (error) => {
        assert.equal(error.statusCode, statusCode);
        assert.equal(error.message.includes("provider secret"), false);
        return true;
      },
    );
  }

  await assert.rejects(
    () =>
      recognizeMedicineImage(
        { image: Buffer.from("not a jpeg"), mediaType: "image/jpeg" },
        { env },
      ),
    { statusCode: 400 },
  );
  await assert.rejects(
    () =>
      recognizeMedicineImage(
        {
          image: Buffer.alloc(MAX_RECOGNITION_IMAGE_BYTES + 1),
          mediaType: "image/png",
        },
        { env },
      ),
    { statusCode: 413 },
  );
});

async function createRouteApp(t, recognize) {
  const app = Fastify({
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  await app.register(medicineRoutes, { recognize });
  t.after(() => app.close());
  return app;
}

test("raw image route passes bytes and media type through dependency injection", async (t) => {
  let received;
  const responseBody = {
    ok: true,
    model: "gemini-vision-test",
    recognition: evidence,
    matchStrategy: "name",
    source: "42_2.csv",
    records: [translatedRecord],
    total: 1,
    recordCount: 6318,
  };
  const app = await createRouteApp(t, async (input) => {
    received = input;
    return responseBody;
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "image/jpeg" },
    payload: jpeg,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, { image: jpeg, mediaType: "image/jpeg" });
  assert.deepEqual(response.json(), responseBody);
});

test("raw image route rejects empty, unsupported, and oversized payloads", async (t) => {
  let calls = 0;
  const app = await createRouteApp(t, async () => {
    calls++;
    throw new Error("must not call");
  });

  const empty = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "image/png" },
    payload: Buffer.alloc(0),
  });
  assert.equal(empty.statusCode, 400);

  const unsupported = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "application/octet-stream" },
    payload: Buffer.from("image"),
  });
  assert.equal(unsupported.statusCode, 415);

  const oversized = Buffer.alloc(MAX_RECOGNITION_IMAGE_BYTES + 1);
  oversized.set(jpeg);
  const tooLarge = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "image/jpeg" },
    payload: oversized,
  });
  assert.equal(tooLarge.statusCode, 413);
  assert.equal(calls, 0);
});

test("raw image route preserves known recognition error statuses", async (t) => {
  const app = await createRouteApp(t, async () => {
    throw new MedicineChatError(422, "Try another image.");
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "image/webp" },
    payload: Buffer.from("RIFF0000WEBP"),
  });
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), { ok: false, error: "Try another image." });
});

test("Swagger publishes raw image media types, limits, records and errors", async () => {
  const swagger = JSON.parse(
    await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../api-docs/swagger.json", import.meta.url), "utf8"),
    ),
  );
  const operation = swagger.paths["/api/medicine/recognize"].post;
  assert.deepEqual(Object.keys(operation.requestBody.content), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(
    operation.requestBody.content["image/jpeg"].schema.maxLength,
    MAX_RECOGNITION_IMAGE_BYTES,
  );
  assert.deepEqual(Object.keys(operation.responses), [
    "200",
    "400",
    "413",
    "415",
    "422",
    "429",
    "502",
    "503",
    "504",
  ]);
  assert.equal(
    swagger.components.schemas.MedicineImageRecognitionResponse.properties
      .records.items.$ref,
    "#/components/schemas/MedicineRecord",
  );
  assert.match(
    swagger.components.schemas.MedicineChatRequest.properties
      .selectedMedicineId.description,
    /opaque recordId/,
  );
  assert.deepEqual(
    Object.keys(swagger.paths["/api/medicine/search"].get.responses),
    ["200", "400", "429", "502", "503", "504"],
  );
});
