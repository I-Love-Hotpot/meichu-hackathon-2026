export const defaultApiBaseUrl = "https://api.mc.dstw.dev";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl = (
  configuredApiBaseUrl === undefined
    ? defaultApiBaseUrl
    : configuredApiBaseUrl
)
  .trim()
  .replace(/\/+$/, "");

const medicineRecordFields = [
  "recordId",
  "licenseNumber",
  "displayName",
  "englishName",
  "shape",
  "dosageForm",
  "color",
  "odor",
  "scoreLine",
  "size",
  "imprint1",
  "imprint2",
  "imageUrl",
];

const recognitionImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maxRecognitionImageBytes = 5 * 1024 * 1024;

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isMedicineRecord = (value) =>
  isObject(value) &&
  medicineRecordFields.every((field) => typeof value[field] === "string");

const isRecognitionEvidence = (value) =>
  isObject(value) &&
  typeof value.text === "string" &&
  Array.isArray(value.medications) &&
  value.medications.every(
    (medicine) =>
      isObject(medicine) &&
      typeof medicine.name === "string" &&
      (medicine.strength === undefined ||
        typeof medicine.strength === "string"),
  ) &&
  Array.isArray(value.pills) &&
  value.pills.every(
    (pill) =>
      isObject(pill) &&
      typeof pill.imprint === "string" &&
      (pill.color === undefined || typeof pill.color === "string") &&
      (pill.shape === undefined || typeof pill.shape === "string"),
  );

export class MedicineApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "MedicineApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new MedicineApiError("Cannot connect to the medicine service.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new MedicineApiError("The server returned an invalid response.", {
      status: response.status,
    });
  }

  if (!response.ok) {
    throw new MedicineApiError(
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error
        : `Medicine service request failed (${response.status}).`,
      { status: response.status, payload },
    );
  }

  return payload;
}

function invalidResponse(status = 200) {
  return new MedicineApiError("The server returned an invalid response.", {
    status,
  });
}

export async function getServiceStatus({ signal } = {}) {
  const payload = await requestJson("/", { signal });
  if (
    typeof payload?.ok !== "boolean" ||
    typeof payload?.message !== "string" ||
    typeof payload?.service !== "string" ||
    typeof payload?.timestamp !== "string"
  ) {
    throw invalidResponse();
  }
  return payload;
}

export async function getHealth({ signal } = {}) {
  const payload = await requestJson("/health", { signal });
  if (
    typeof payload?.ok !== "boolean" ||
    typeof payload?.service !== "string" ||
    typeof payload?.timestamp !== "string"
  ) {
    throw invalidResponse();
  }
  return payload;
}

export async function searchMedicines(query, { signal } = {}) {
  const payload = await requestJson(
    `/api/medicine/search?q=${encodeURIComponent(query.trim())}`,
    { signal },
  );
  if (
    payload?.ok !== true ||
    typeof payload.query !== "string" ||
    payload.source !== "42_2.csv" ||
    !Array.isArray(payload.records) ||
    !payload.records.every(isMedicineRecord) ||
    !Number.isInteger(payload.total) ||
    !Number.isInteger(payload.recordCount)
  ) {
    throw invalidResponse();
  }
  return payload;
}

export async function recognizeMedicineImage(file, { signal } = {}) {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    throw new MedicineApiError("Select a non-empty medicine image.", {
      status: 400,
    });
  }
  if (!recognitionImageTypes.has(file.type)) {
    throw new MedicineApiError("Use a JPEG, PNG, or WebP image.", {
      status: 415,
    });
  }
  if (file.size > maxRecognitionImageBytes) {
    throw new MedicineApiError("The image must be 5 MiB or smaller.", {
      status: 413,
    });
  }

  const payload = await requestJson("/api/medicine/recognize", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
    signal,
  });
  if (
    payload?.ok !== true ||
    typeof payload.model !== "string" ||
    !isRecognitionEvidence(payload.recognition) ||
    !["name", "text", "imprint", "none"].includes(payload.matchStrategy) ||
    !Array.isArray(payload.records) ||
    !payload.records.every(isMedicineRecord) ||
    !Number.isInteger(payload.total) ||
    !Number.isInteger(payload.recordCount) ||
    payload.source !== "42_2.csv"
  ) {
    throw invalidResponse();
  }
  return payload;
}

export async function lookupMedicineByLicenseNumber(
  licenseNumber,
  { signal } = {},
) {
  const payload = await requestJson(
    `/api/medicine?license_number=${encodeURIComponent(licenseNumber.trim())}`,
    { signal },
  );
  if (
    payload?.ok !== true ||
    !isObject(payload.medicine) ||
    !Number.isInteger(payload.medicine.id) ||
    typeof payload.medicine.license_number !== "string"
  ) {
    throw invalidResponse();
  }
  return payload;
}

export async function chatWithMedicineAssistant(body, { signal } = {}) {
  const payload = await requestJson("/api/medicine/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (
    payload?.ok !== true ||
    !isObject(payload.reply) ||
    typeof payload.reply.answer !== "string" ||
    !Array.isArray(payload.reply.warnings) ||
    !payload.reply.warnings.every((warning) => typeof warning === "string") ||
    !Array.isArray(payload.reply.followUpQuestions) ||
    !payload.reply.followUpQuestions.every(
      (question) => typeof question === "string",
    ) ||
    typeof payload.disclaimer !== "string" ||
    !Array.isArray(payload.sources) ||
    !payload.sources.every(isMedicineRecord) ||
    !isObject(payload.catalog) ||
    !["matched", "ambiguous", "not_found"].includes(payload.catalog.status)
  ) {
    throw invalidResponse();
  }
  return payload;
}
