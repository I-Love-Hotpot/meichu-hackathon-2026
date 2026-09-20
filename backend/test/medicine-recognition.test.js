import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import medicineRoutes from "../src/routes/medicine.routes.js";
import {
  MAX_RECOGNITION_IMAGE_BYTES,
  recognizeMedicineImage,
} from "../src/services/medicine-recognition.service.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pillId = "000386";
const medicine = {
  id: 2,
  license_number: "內衛成製字第000386號",
  chinese_name: "建功丸",
  english_name: "CHENG KONG PILL",
  shape: "其他",
  dosage_form: "",
  color: "棕",
  odor: "",
  score_line: "無",
  size: "8",
  imprint_1: "",
  imprint_2: "",
  image_url: "https://example.test/pill.jpg",
  created_at: "2026-09-19T16:58:24.000Z",
};

const env = {
  MEDICINE_RECOGNIZER_TIMEOUT_MS: "5000",
};

function inferenceResponse(pillIds) {
  return async (url, options) => {
    assert.equal(url, "http://chia.dstw.dev/recognize");
    assert.equal(options.headers["Content-Type"], "image/jpeg");
    assert.deepEqual(options.body, jpeg);
    return new Response(JSON.stringify({ pill_id: pillIds }));
  };
}

test("numeric inference pill IDs return complete MariaDB rows and frontend records", async () => {
  const result = await recognizeMedicineImage(
    { image: jpeg, mediaType: "image/jpeg" },
    {
      env,
      fetchImpl: inferenceResponse([pillId]),
      repository: {
        findAllByPillId: async (id) => {
          assert.equal(id, pillId);
          return [medicine];
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.model, "pill_detector.pt");
  assert.equal(result.matchStrategy, "appearance");
  assert.equal(result.source, "MariaDB");
  assert.deepEqual(result.pill_id, [pillId]);
  assert.deepEqual(result.medicines, [medicine]);
  assert.equal(result.records[0].displayName, medicine.english_name);
  assert.equal(result.records[0].licenseNumber, medicine.license_number);
  assert.deepEqual(result.inference, { pill_id: [pillId] });
});

test("no detection succeeds with empty candidate arrays", async () => {
  const result = await recognizeMedicineImage(
    { image: jpeg, mediaType: "image/jpeg" },
    {
      env,
      fetchImpl: inferenceResponse([]),
      repository: { findAllByPillId: async () => assert.fail("must not query") },
    },
  );
  assert.equal(result.matchStrategy, "none");
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.medicines, []);
});

test("recognition validates image type, bytes, and size", async () => {
  await assert.rejects(
    () => recognizeMedicineImage({ image: Buffer.from("bad"), mediaType: "image/jpeg" }),
    { statusCode: 400 },
  );
  await assert.rejects(
    () => recognizeMedicineImage({ image: jpeg, mediaType: "application/octet-stream" }),
    { statusCode: 415 },
  );
  await assert.rejects(
    () => recognizeMedicineImage({
      image: Buffer.alloc(MAX_RECOGNITION_IMAGE_BYTES + 1),
      mediaType: "image/png",
    }),
    { statusCode: 413 },
  );
});

test("recognition rejects non-numeric inference IDs", async () => {
  await assert.rejects(
    () => recognizeMedicineImage(
      { image: jpeg, mediaType: "image/jpeg" },
      {
        env,
        fetchImpl: inferenceResponse([medicine.license_number]),
        repository: { findAllByPillId: async () => assert.fail("must not query") },
      },
    ),
    { statusCode: 502 },
  );
});

async function createRouteApp(t, recognize) {
  const app = Fastify({
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  await app.register(medicineRoutes, {
    recognize,
    recognitionRepository: { close: async () => {}, findAllByPillId: async () => [] },
  });
  t.after(() => app.close());
  return app;
}

test("raw image API passes bytes and repository to recognition", async (t) => {
  let received;
  const responseBody = {
    ok: true,
    pill_id: [],
    model: "pill_detector.pt",
    recognition: { text: "", medications: [], pills: [] },
    matchStrategy: "none",
    source: "MariaDB",
    records: [],
    medicines: [],
    total: 0,
    recordCount: 0,
    inference: { pill_id: [] },
  };
  const app = await createRouteApp(t, async (input, options) => {
    received = { input, options };
    return responseBody;
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/medicine/recognize",
    headers: { "content-type": "image/jpeg" },
    payload: jpeg,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(received.input, { image: jpeg, mediaType: "image/jpeg" });
  assert.equal(typeof received.options.repository.findAllByPillId, "function");
  assert.deepEqual(response.json(), responseBody);
});
