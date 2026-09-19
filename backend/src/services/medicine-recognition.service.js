import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRecordId } from "./google-translate.service.js";
import { createMedicineRepository } from "./medicine-database.service.js";
import { MedicineChatError } from "./medicine-error.js";

export const MAX_RECOGNITION_IMAGE_BYTES = 5 * 1024 * 1024;
export const RECOGNITION_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

const maxOutputBytes = 256 * 1024;
const extensionByMediaType = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function imageMatchesMediaType(image, mediaType) {
  if (mediaType === "image/jpeg") {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return image.length >= 8 && image.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  return mediaType === "image/webp" && image.length >= 12
    && image.subarray(0, 4).toString("ascii") === "RIFF"
    && image.subarray(8, 12).toString("ascii") === "WEBP";
}

function recognizerConfig(env) {
  const bundledScript = fileURLToPath(
    new URL("../../pill_inference_package/inference.py", import.meta.url),
  );
  const script = env.MEDICINE_RECOGNIZER_SCRIPT?.trim() || bundledScript;
  const python = env.MEDICINE_RECOGNIZER_PYTHON?.trim() || "python3";
  const timeoutMs = Number(env.MEDICINE_RECOGNIZER_TIMEOUT_MS || 30000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new MedicineChatError(
      503,
      "The medicine image recognition timeout setting is invalid. Please contact the administrator.",
    );
  }
  return { script, python, timeoutMs };
}

function parseRecognizerOutput(output) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new MedicineChatError(502, "The medicine recognizer returned invalid JSON.");
  }
  if (!Array.isArray(payload?.predictions) || payload.predictions.length > 3) {
    throw new MedicineChatError(502, "The medicine recognizer returned invalid predictions.");
  }
  const ids = payload.predictions.map(
    (prediction) => prediction?.license_number || prediction?.pill_id,
  );
  if (ids.some((id) => typeof id !== "string" || !id.trim() || id.trim().length > 255)) {
    throw new MedicineChatError(502, "The medicine recognizer returned an invalid medicine ID.");
  }
  return {
    ids: ids.map((id) => id.trim()),
    status: typeof payload.status === "string" ? payload.status : "unknown",
    detectedFeatures: payload.detected_features || {},
    detectionSource: payload.detection_source || "unknown",
    predictions: payload.predictions,
  };
}

function runRecognizer(imagePath, env) {
  const { script, python, timeoutMs } = recognizerConfig(env);
  const outputPath = join(dirname(imagePath), "prediction.json");
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [script, "--image", imagePath, "--output", outputPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new MedicineChatError(504, "Medicine image recognition timed out. Please try again."));
    }, timeoutMs);

    child.on("error", (cause) => {
      const error = new MedicineChatError(
        503,
        "Medicine image recognition is unavailable. Please contact the administrator.",
      );
      error.cause = cause;
      finish(error);
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maxOutputBytes) {
        child.kill("SIGTERM");
        finish(new MedicineChatError(502, "The medicine recognizer returned too much data."));
      }
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr) <= maxOutputBytes) stderr += chunk;
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const statusCode = code === 2 ? 400 : code === 3 || code === 4 ? 503 : 502;
        const message = code === 2
          ? "The uploaded file could not be read as an image."
          : code === 3 || code === 4
            ? "Medicine image recognition is unavailable. Please contact the administrator."
            : "Medicine image recognition failed. Please try again.";
        const error = new MedicineChatError(statusCode, message);
        if (stderr.trim()) error.cause = new Error(stderr.trim());
        finish(error);
        return;
      }
      try {
        finish(null, parseRecognizerOutput(stdout));
      } catch (error) {
        finish(error);
      }
    });
  });
}

function toClientRecord(row) {
  return {
    recordId: encodeRecordId(row.license_number),
    licenseNumber: row.license_number,
    displayName: row.english_name || row.chinese_name || row.license_number,
    englishName: row.english_name || "",
    shape: row.shape || "",
    dosageForm: "",
    color: row.color || "",
    odor: "",
    scoreLine: row.score_line || "",
    size: row.size || "",
    imprint1: row.imprint_1 || "",
    imprint2: row.imprint_2 || "",
    imageUrl: row.image_url || "",
  };
}

export async function recognizeMedicineImage(
  { image, mediaType },
  { env = process.env, repository } = {},
) {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new MedicineChatError(400, "Provide a non-empty medicine image.");
  }
  if (image.length > MAX_RECOGNITION_IMAGE_BYTES) {
    throw new MedicineChatError(413, "Medicine images must not exceed 5 MiB.");
  }
  if (!RECOGNITION_MEDIA_TYPES.includes(mediaType)) {
    throw new MedicineChatError(415, "Medicine images must use JPEG, PNG, or WebP format.");
  }
  if (!imageMatchesMediaType(image, mediaType)) {
    throw new MedicineChatError(400, "The image bytes do not match the declared image format.");
  }

  const directory = await mkdtemp(join(tmpdir(), "medicine-recognize-"));
  const imagePath = join(directory, `image${extensionByMediaType[mediaType]}`);
  const ownRepository = repository ? null : createMedicineRepository();
  const database = repository || ownRepository;
  try {
    await writeFile(imagePath, image, { mode: 0o600 });
    const local = await runRecognizer(imagePath, env);
    const medicines = await Promise.all(
      local.ids.map(async (licenseNumber) => ({
        license_number: licenseNumber,
        medicine: await database.findByLicenseNumber(licenseNumber),
      })),
    );
    const records = medicines
      .filter(({ medicine }) => medicine)
      .map(({ medicine }) => toClientRecord(medicine));
    const colors = Array.isArray(local.detectedFeatures.colors)
      ? local.detectedFeatures.colors.join(", ")
      : "";
    const shape = typeof local.detectedFeatures.shape === "string"
      ? local.detectedFeatures.shape
      : "";

    return {
      ok: true,
      model: "pill_detector.pt",
      recognition: {
        text: "",
        medications: [],
        pills: colors || shape
          ? [{ imprint: "", ...(colors ? { color: colors } : {}), ...(shape ? { shape } : {}) }]
          : [],
      },
      matchStrategy: local.ids.length ? "appearance" : "none",
      source: "MariaDB",
      records,
      medicines,
      total: records.length,
      recordCount: local.ids.length,
      inference: local,
    };
  } finally {
    await ownRepository?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
