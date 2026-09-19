import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import medicineRecognizeRoutes from "../src/routes/medicine-recognize.routes.js";
import {
  MedicineRecognitionError,
  recognizeMedicineImage,
} from "../src/services/medicine-recognition.service.js";

function multipartImage({ field = "image", type = "image/png", content = "image" } = {}) {
  const boundary = "medicine-test-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="pill.png"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
    ),
  };
}

async function createApp(t, { recognize, findByLicenseNumber }) {
  const app = Fastify();
  await app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
  await app.register(medicineRecognizeRoutes, {
    recognize,
    repository: { findByLicenseNumber, close: async () => {} },
  });
  t.after(() => app.close());
  return app;
}

test("recognizes an image and looks up every returned license number", async (t) => {
  const ids = ["license-a", "license-b", "license-c"];
  const app = await createApp(t, {
    recognize: async () => ({ ids, confidences: [0.9, 0.8, 0.7] }),
    findByLicenseNumber: async (id) => (id === "license-b" ? null : { license_number: id }),
  });
  const response = await app.inject({ method: "POST", url: "/api/medicine/recognize", ...multipartImage() });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    recognition: { ids, confidences: [0.9, 0.8, 0.7] },
    medicines: [
      { license_number: "license-a", medicine: { license_number: "license-a" } },
      { license_number: "license-b", medicine: null },
      { license_number: "license-c", medicine: { license_number: "license-c" } },
    ],
  });
});

test("requires a supported image upload and returns safe recognizer failures", async (t) => {
  const app = await createApp(t, {
    recognize: async () => { throw new MedicineRecognitionError(504, "Medicine image recognition timed out. Please try again."); },
    findByLicenseNumber: async () => assert.fail("must not query"),
  });
  const invalid = await app.inject({ method: "POST", url: "/api/medicine/recognize", ...multipartImage({ type: "application/pdf" }) });
  assert.equal(invalid.statusCode, 400);
  const timeout = await app.inject({ method: "POST", url: "/api/medicine/recognize", ...multipartImage() });
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.json().ok, false);
});

test("local CLI adapter passes --image and extracts full license numbers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "recognizer-cli-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, "recognizer.mjs");
  const image = join(directory, "pill.png");
  await writeFile(image, "image");
  await writeFile(script, `
    const args = process.argv.slice(2);
    if (args[0] !== "--image" || args[2] !== "--output") process.exit(9);
    console.log(JSON.stringify({
      status: "candidates_found",
      detected_features: { colors: ["白色"], shape: "圓形" },
      detection_source: "test",
      predictions: [
        { pill_id: "000386", license_number: "內衛成製字第000386號" },
        { pill_id: "000075", license_number: "內衛成製字第000075號" }
      ]
    }));
  `);

  const result = await recognizeMedicineImage(image, {
    env: {
      MEDICINE_RECOGNIZER_SCRIPT: script,
      MEDICINE_RECOGNIZER_PYTHON: process.execPath,
      MEDICINE_RECOGNIZER_TIMEOUT_MS: "5000",
    },
  });
  assert.deepEqual(result.ids, ["內衛成製字第000386號", "內衛成製字第000075號"]);
  assert.equal(result.status, "candidates_found");
  assert.equal(result.detected_features.shape, "圓形");
});
