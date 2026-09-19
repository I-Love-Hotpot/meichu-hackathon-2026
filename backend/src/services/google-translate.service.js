import { MedicineChatError } from "./medicine-error.js";

const cache = new Map();
const chinesePattern = /\p{Script=Han}/u;
const translatableFields = [
  "licenseNumber", "chineseName", "shape", "dosageForm", "color", "odor",
  "scoreLine", "imprint1", "imprint2",
];

export function encodeRecordId(value) {
  return `med_${Buffer.from(value, "utf8").toString("base64url")}`;
}

export function decodeRecordId(value) {
  if (typeof value !== "string" || !value.startsWith("med_")) return value;
  try {
    const decoded = Buffer.from(value.slice(4), "base64url").toString("utf8");
    return encodeRecordId(decoded) === value ? decoded : value;
  } catch {
    return value;
  }
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export async function translateToEnglish(texts, { env = process.env, fetchImpl = fetch } = {}) {
  const values = [...new Set(texts.filter((value) => typeof value === "string" && chinesePattern.test(value)))];
  if (!values.length) return new Map();
  const missing = values.filter((value) => !cache.has(value));
  if (missing.length) {
    const apiKey = env.GOOGLE_TRANSLATE_API_KEY?.trim();
    if (!apiKey) {
      throw new MedicineChatError(503, "English translation is not configured. Please contact the administrator.");
    }
    const timeoutMs = Number(env.GOOGLE_TRANSLATE_TIMEOUT_MS || 15000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
      throw new MedicineChatError(503, "The translation timeout setting is invalid. Please contact the administrator.");
    }
    for (let index = 0; index < missing.length; index += 128) {
      const batch = missing.slice(index, index + 128);
      let response;
      let data;
      try {
        response = await fetchImpl("https://translation.googleapis.com/language/translate/v2", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ q: batch, source: "zh-TW", target: "en", format: "text" }),
        });
        data = await response.json();
      } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw new MedicineChatError(504, "English translation timed out. Please try again.");
        }
        throw new MedicineChatError(502, "English translation is temporarily unavailable. Please try again.");
      }
      if (response.status === 429) throw new MedicineChatError(429, "The translation service is busy or its quota is exhausted. Please try again later.");
      if (!response.ok) throw new MedicineChatError(502, "English translation is temporarily unavailable. Please try again.");
      const translations = data?.data?.translations;
      if (!Array.isArray(translations) || translations.length !== batch.length || translations.some((item) => typeof item?.translatedText !== "string")) {
        throw new MedicineChatError(502, "The translation service returned an invalid response.");
      }
      batch.forEach((value, offset) => cache.set(value, decodeEntities(translations[offset].translatedText).trim()));
    }
  }
  return new Map(values.map((value) => [value, cache.get(value)]));
}

export async function translateMedicineRecords(records, options = {}) {
  const dictionary = await translateToEnglish(
    records.flatMap((record) => translatableFields.map((field) => record[field])),
    options,
  );
  return records.map((record) => {
    const translated = { ...record };
    for (const field of translatableFields) {
      if (dictionary.has(record[field])) translated[field] = dictionary.get(record[field]);
    }
    // The original CSV English name is authoritative when present. Otherwise,
    // Google Translate supplies an English display name from the Chinese name.
    translated.displayName = record.englishName || translated.chineseName;
    translated.recordId = encodeRecordId(record.licenseNumber);
    delete translated.chineseName;
    return translated;
  });
}

export function clearTranslationCache() {
  cache.clear();
}
