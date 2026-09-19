import {
  loadCatalog,
  searchCatalog,
} from "./medicine-catalog.service.js";
import { MedicineChatError } from "./medicine-error.js";
import { DEFAULT_MODEL } from "./gemini.service.js";
import { translateMedicineRecords } from "./google-translate.service.js";

export const MAX_RECOGNITION_IMAGE_BYTES = 5 * 1024 * 1024;
export const RECOGNITION_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const recognitionEvidenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "medications", "pills"],
  properties: {
    text: {
      type: "string",
      maxLength: 6000,
      description:
        "Visible OCR text copied from the image. Empty when no text is legible.",
    },
    medications: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          strength: { type: "string", maxLength: 100 },
        },
      },
    },
    pills: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["imprint"],
        properties: {
          imprint: {
            type: "string",
            maxLength: 100,
            description:
              "Only characters visibly printed or embossed on one pill side; empty when none are legible.",
          },
          color: { type: "string", maxLength: 100 },
          shape: { type: "string", maxLength: 100 },
        },
      },
    },
  },
};

const extractionInstructions = `
You are a strict visual transcription tool, not a medicine identification system.
Copy only text, medicine names, strengths, and pill markings that are directly visible in the supplied image.
Never identify a medicine from appearance, packaging style, color, shape, a logo, or model memory.
Never complete a partially hidden name or marking and never infer an ingredient, dosage, indication, manufacturer, or license number.
For medications, include a name only when that name is legible. A nearby visible strength may be copied into strength.
Every medication name must also appear in text as part of the visible OCR transcription.
For pills, imprint means only legible characters printed or embossed on that pill side. Use an empty string when no characters are legible. Color and shape are observations only.
Preserve the language and spelling visible in the image. Use empty strings or arrays instead of guesses.
Return JSON matching the provided schema and no prose.
`;

function normalizeEvidence(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateOptionalText(value, maxLength) {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= maxLength)
  );
}

function normalizeRecognitionEvidence(value) {
  const valid =
    isPlainObject(value) &&
    hasOnlyKeys(value, ["text", "medications", "pills"]) &&
    typeof value.text === "string" &&
    value.text.length <= 6000 &&
    Array.isArray(value.medications) &&
    value.medications.length <= 10 &&
    value.medications.every(
      (item) =>
        isPlainObject(item) &&
        hasOnlyKeys(item, ["name", "strength"]) &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        item.name.length <= 200 &&
        validateOptionalText(item.strength, 100),
    ) &&
    Array.isArray(value.pills) &&
    value.pills.length <= 10 &&
    value.pills.every(
      (item) =>
        isPlainObject(item) &&
        hasOnlyKeys(item, ["imprint", "color", "shape"]) &&
        typeof item.imprint === "string" &&
        item.imprint.length <= 100 &&
        validateOptionalText(item.color, 100) &&
        validateOptionalText(item.shape, 100),
    );

  if (!valid) {
    throw new MedicineChatError(
      502,
      "The medicine recognition service returned an invalid response. Please try again.",
    );
  }

  return {
    text: value.text.trim(),
    medications: value.medications.map(({ name, strength }) => {
      const normalizedStrength = strength?.trim();
      return {
        name: name.trim(),
        ...(normalizedStrength ? { strength: normalizedStrength } : {}),
      };
    }),
    pills: value.pills.map(({ imprint, color, shape }) => {
      const normalizedColor = color?.trim();
      const normalizedShape = shape?.trim();
      return {
        imprint: imprint.trim(),
        ...(normalizedColor ? { color: normalizedColor } : {}),
        ...(normalizedShape ? { shape: normalizedShape } : {}),
      };
    }),
  };
}

function imageMatchesMediaType(image, mediaType) {
  if (mediaType === "image/jpeg") {
    return image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return (
      image.length >= 8 &&
      image.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  return (
    mediaType === "image/webp" &&
    image.length >= 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function uniqueRecords(records) {
  return [
    ...new Map(records.map((record) => [record.licenseNumber, record])).values(),
  ];
}

export function matchRecognitionEvidence(
  recognition,
  {
    env = process.env,
    limit = 8,
    search = searchCatalog,
    load = loadCatalog,
  } = {},
) {
  const nameMatches = [];
  let recordCount;
  const normalizedText = normalizeEvidence(recognition.text);

  for (const medication of recognition.medications) {
    // A model-supplied name is usable only when grounded in the same response's
    // visible OCR. This prevents an appearance-based model guess from becoming
    // a catalog lookup; without text, only an exact visible imprint can match.
    const normalizedName = normalizeEvidence(medication.name);
    if (!normalizedName || !normalizedText.includes(normalizedName)) continue;
    const detailedQuery = [medication.name, medication.strength]
      .filter(Boolean)
      .join(" ");
    // Ask the deterministic catalog search for every match so `total` remains
    // accurate after candidates from multiple visible medicine names are merged.
    let result = search(detailedQuery, {
      env,
      limit: Number.MAX_SAFE_INTEGER,
    });
    if (!result.total && medication.strength) {
      result = search(medication.name, {
        env,
        limit: Number.MAX_SAFE_INTEGER,
      });
    }
    recordCount ??= result.recordCount;
    nameMatches.push(...result.records);
  }

  const uniqueNameMatches = uniqueRecords(nameMatches);
  if (uniqueNameMatches.length) {
    return {
      strategy: "name",
      records: uniqueNameMatches.slice(0, limit),
      total: uniqueNameMatches.length,
      recordCount,
    };
  }

  if (normalizedText) {
    const result = search(recognition.text, { env, limit });
    if (result.total) {
      return {
        strategy: "text",
        records: result.records,
        total: result.total,
        recordCount: result.recordCount,
      };
    }
    recordCount ??= result.recordCount;
  }

  const ignoredImprints = new Set(["none", "unknown", "na", "noimprint"]);
  const visibleImprints = new Set(
    recognition.pills
      .map(({ imprint }) => normalizeEvidence(imprint))
      .filter((imprint) => imprint && !ignoredImprints.has(imprint)),
  );

  if (visibleImprints.size) {
    const catalog = load(env);
    recordCount = catalog.length;
    const matches = catalog.filter((record) => {
      const recordImprints = [record.imprint1, record.imprint2]
        .flatMap((value) => String(value || "").split(";;;"))
        .map(normalizeEvidence)
        .filter(Boolean);
      return recordImprints.some((imprint) => visibleImprints.has(imprint));
    });
    return {
      strategy: "imprint",
      records: matches.slice(0, limit),
      total: matches.length,
      recordCount,
    };
  }

  if (recordCount === undefined) {
    recordCount = load(env).length;
  }
  return { strategy: "none", records: [], total: 0, recordCount };
}

export async function recognizeMedicineImage(
  { image, mediaType },
  {
    fetchImpl = fetch,
    translateFetchImpl = fetch,
    env = process.env,
    search = searchCatalog,
    load = loadCatalog,
    translateRecords = translateMedicineRecords,
  } = {},
) {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new MedicineChatError(400, "Provide a non-empty medicine image.");
  }
  if (image.length > MAX_RECOGNITION_IMAGE_BYTES) {
    throw new MedicineChatError(413, "Medicine images must not exceed 5 MiB.");
  }
  if (!RECOGNITION_MEDIA_TYPES.includes(mediaType)) {
    throw new MedicineChatError(
      415,
      "Medicine images must use JPEG, PNG, or WebP format.",
    );
  }
  if (!imageMatchesMediaType(image, mediaType)) {
    throw new MedicineChatError(
      400,
      "The image bytes do not match the declared image format.",
    );
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new MedicineChatError(
      503,
      "Medicine recognition is not configured. Please contact the administrator.",
    );
  }
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutMs = Number(env.GEMINI_TIMEOUT_MS || 30000);
  if (
    !/^[a-zA-Z0-9._-]+$/.test(model) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 120000
  ) {
    throw new MedicineChatError(
      503,
      "The medicine recognition configuration is invalid. Please contact the administrator.",
    );
  }

  let response;
  let data;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: extractionInstructions }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe only directly visible medicine-package text and pill markings from this image.",
                },
                {
                  inlineData: {
                    mimeType: mediaType,
                    data: image.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: recognitionEvidenceSchema,
            maxOutputTokens: 2048,
          },
        }),
      },
    );
    if (response.ok) data = await response.json();
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new MedicineChatError(
        504,
        "Medicine recognition timed out. Please try again.",
      );
    }
    throw new MedicineChatError(
      502,
      "Medicine recognition is temporarily unavailable. Please try again.",
    );
  }

  if (response.status === 429) {
    throw new MedicineChatError(
      429,
      "Medicine recognition is busy or its quota is exhausted. Please try again later.",
    );
  }
  if (!response.ok) {
    throw new MedicineChatError(
      502,
      "Gemini is temporarily unavailable. Please try again or contact the administrator.",
    );
  }
  const candidate = data?.candidates?.[0];
  if (
    data?.promptFeedback?.blockReason ||
    candidate?.finishReason === "SAFETY"
  ) {
    throw new MedicineChatError(
      422,
      "The medicine image could not be processed safely. Try another image.",
    );
  }
  if (candidate?.finishReason !== "STOP") {
    throw new MedicineChatError(
      502,
      "The medicine recognition service returned an incomplete response. Please try again.",
    );
  }

  let recognition;
  try {
    const text = candidate.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text || "")
      .join("");
    recognition = normalizeRecognitionEvidence(JSON.parse(text));
  } catch (error) {
    if (error instanceof MedicineChatError) throw error;
    throw new MedicineChatError(
      502,
      "The medicine recognition service returned an invalid response. Please try again.",
    );
  }

  const match = matchRecognitionEvidence(recognition, {
    env,
    search,
    load,
  });
  const records = await translateRecords(match.records, {
    env,
    fetchImpl: translateFetchImpl,
  });

  return {
    ok: true,
    model,
    recognition,
    matchStrategy: match.strategy,
    source: "42_2.csv",
    records,
    total: match.total,
    recordCount: match.recordCount,
  };
}
