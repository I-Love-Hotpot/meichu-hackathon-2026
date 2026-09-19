import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import medicineRoutes from "../src/routes/medicine.routes.js";
import {
  MAX_RECOGNITION_IMAGE_BYTES,
  recognizeMedicineImage,
} from "../src/services/medicine-recognition.service.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const medicine = {
  id: 2,
  license_number: "內衛成製字第000386號",
  chinese_name: "建功丸",
  english_name: "CHENG KONG PILL",
  shape: "其他",
  color: "棕",
  score_line: "無",
  size: "8",
  imprint_1: "",
  imprint_2: "",
  image_url: "https://example.test/pill.jpg",
};

async function fakeRecognizer(t, payload) {
  const directory = await mkdtemp(join(tmpdir(), "recognizer-cli-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, "recognizer.mjs");
  await writeFile(script, `
    const args = process.argv.slice(2);
    if (args[0] !== "--image" || args[2] !== "--output") process.exit(9);
    console.log(${JSON.stringify(JSON.stringify(payload))});
  `);
  return {
    MEDICINE_RECOGNIZER_SCRIPT: script,
    MEDICINE_RECOGNIZER_PYTHON: process.execPath,
    MEDICINE_RECOGNIZER_TIMEOUT_MS: "5000",
  };
}

test("local model IDs are looked up in MariaDB and mapped for the frontend", async (t) => {
  const env = await fakeRecognizer(t, {
    status: "candidates_found",
    detected_features: { colors: ["棕色"], shape: "其他" },
    detection_source: "yolo_conf_0.25",
    predictions: [
      {
        pill_id: "000386",
        license_number: medicine.license_number,
        drug_name: medicine.chinese_name,
        appearance_score: 1,
      },
    ],
  });
  const result = await recognizeMedicineImage(
    { image: jpeg, mediaType: "image/jpeg" },
    {
      env,
      repository: {
        findByLicenseNumber: async (id) => {
          assert.equal(id, medicine.license_number);
          return medicine;
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.model, "pill_detector.pt");
  assert.equal(result.matchStrategy, "appearance");
  assert.equal(result.source, "MariaDB");
  assert.deepEqual(result.medicines, [
    { license_number: medicine.license_number, medicine },
  ]);
  assert.equal(result.records[0].displayName, medicine.english_name);
  assert.equal(result.records[0].licenseNumber, medicine.license_number);
  assert.equal(result.inference.detectedFeatures.shape, "其他");
});

test("no detection succeeds with empty candidate arrays", async (t) => {
  const env = await fakeRecognizer(t, {
    status: "no_detection",
    detected_features: {},
    predictions: [],
    detection_source: "no_detection",
  });
  const result = await recognizeMedicineImage(
    { image: jpeg, mediaType: "image/jpeg" },
    { env, repository: { findByLicenseNumber: async () => assert.fail("must not query") } },
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

async function createRouteApp(t, recognize) {
  const app = Fastify({
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  await app.register(medicineRoutes, {
    recognize,
    recognitionRepository: { close: async () => {}, findByLicenseNumber: async () => null },
  });
  t.after(() => app.close());
  return app;
}

test("raw image API passes bytes and repository to local recognition", async (t) => {
  let received;
  const responseBody = {
    ok: true,
    model: "pill_detector.pt",
    recognition: { text: "", medications: [], pills: [] },
    matchStrategy: "none",
    source: "MariaDB",
    records: [],
    medicines: [],
    total: 0,
    recordCount: 0,
    inference: { ids: [], predictions: [] },
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
  assert.equal(typeof received.options.repository.findByLicenseNumber, "function");
  assert.deepEqual(response.json(), responseBody);
});
