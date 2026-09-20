import { encodeRecordId } from "./google-translate.service.js";
import { createMedicineRepository } from "./medicine-database.service.js";
import { MedicineChatError } from "./medicine-error.js";

export const MAX_RECOGNITION_IMAGE_BYTES = 5 * 1024 * 1024;
export const RECOGNITION_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

function inferenceConfig(env) {
  const baseUrl = (env.MEDICINE_INFERENCE_URL || "http://chia.dstw.dev")
    .trim()
    .replace(/\/+$/, "");
  const timeoutMs = Number(env.MEDICINE_RECOGNIZER_TIMEOUT_MS || 30000);
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1000
    || timeoutMs > 120000) {
    throw new MedicineChatError(
      503,
      "The medicine image recognition configuration is invalid. Please contact the administrator.",
    );
  }
  return { baseUrl, timeoutMs };
}

async function callInferenceService(image, mediaType, { env, fetchImpl }) {
  const { baseUrl, timeoutMs } = inferenceConfig(env);
  let response;
  let payload;
  try {
    response = await fetchImpl(`${baseUrl}/recognize`, {
      method: "POST",
      headers: { "Content-Type": mediaType },
      body: image,
      signal: AbortSignal.timeout(timeoutMs),
    });
    payload = await response.json();
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new MedicineChatError(504, "Medicine image recognition timed out. Please try again.");
    }
    throw new MedicineChatError(
      503,
      "Medicine image recognition is unavailable. Please contact the administrator.",
    );
  }
  if (!response.ok) {
    const statusCode = [400, 413, 415, 502, 503].includes(response.status)
      ? response.status
      : 502;
    throw new MedicineChatError(
      statusCode,
      statusCode < 500
        ? payload?.error || "The image could not be processed."
        : "Medicine image recognition failed. Please try again.",
    );
  }
  if (!payload || Object.keys(payload).length !== 1
    || !Array.isArray(payload.pill_id)
    || payload.pill_id.length > 3
    || payload.pill_id.some((id) => typeof id !== "string" || !/^\d{6}$/.test(id))) {
    throw new MedicineChatError(502, "The medicine recognizer returned invalid pill IDs.");
  }
  return payload.pill_id;
}

function toClientRecord(row) {
  return {
    recordId: encodeRecordId(row.license_number),
    licenseNumber: row.license_number,
    displayName: row.english_name || row.chinese_name || row.license_number,
    englishName: row.english_name || "",
    shape: row.shape || "",
    dosageForm: row.dosage_form || "",
    color: row.color || "",
    odor: row.odor || "",
    scoreLine: row.score_line || "",
    size: row.size || "",
    imprint1: row.imprint_1 || "",
    imprint2: row.imprint_2 || "",
    imageUrl: row.image_url || "",
  };
}

export async function recognizeMedicineImage(
  { image, mediaType },
  { env = process.env, fetchImpl = fetch, repository } = {},
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

  const pillIds = await callInferenceService(image, mediaType, { env, fetchImpl });
  const ownRepository = repository ? null : createMedicineRepository();
  const database = repository || ownRepository;
  try {
    const matches = await Promise.all(
      pillIds.map((pillId) => database.findAllByPillId(pillId)),
    );
    const medicines = matches.flat();
    const records = medicines.map(toClientRecord);
    return {
      ok: true,
      pill_id: pillIds,
      model: "pill_detector.pt",
      recognition: { text: "", medications: [], pills: [] },
      matchStrategy: pillIds.length ? "appearance" : "none",
      source: "MariaDB",
      records,
      medicines,
      total: records.length,
      recordCount: pillIds.length,
      inference: { pill_id: pillIds },
    };
  } finally {
    await ownRepository?.close();
  }
}
