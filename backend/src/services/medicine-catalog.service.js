import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MedicineChatError } from "./medicine-error.js";

const bundledPath = fileURLToPath(new URL("../../resources/42_2.csv", import.meta.url));
const fields = {
  licenseNumber: "許可證字號", chineseName: "中文品名", englishName: "英文品名",
  shape: "形狀", dosageForm: "特殊劑型", color: "顏色", odor: "特殊氣味",
  scoreLine: "刻痕", size: "外觀尺寸", imprint1: "標註一", imprint2: "標註二", imageUrl: "外觀圖檔連結",
};
let cache;

// CSV quoting includes embedded commas/newlines and escaped double quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell); cell = ""; closed = false;
      if (char !== ",") {
        if (char === "\r" && input[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error("Invalid CSV quoting");
      cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV field");
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

const normalize = (value) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function loadCatalog(env = process.env) {
  const path = env.MEDICINE_CSV_PATH?.trim() ? resolve(env.MEDICINE_CSV_PATH) : bundledPath;
  try {
    const stat = statSync(path);
    const key = `${path}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (cache?.key === key) return cache.records;
    const [headers, ...rows] = parseCsv(readFileSync(path, "utf8"));
    if (!headers || Object.values(fields).some((field) => !headers.includes(field)) || !rows.length) throw new Error("Missing columns");
    const licenses = new Set();
    const records = rows.map((row) => {
      if (row.length !== headers.length) throw new Error("Invalid column count");
      const record = Object.fromEntries(Object.entries(fields).map(([key, label]) => [key, row[headers.indexOf(label)].trim()]));
      if (!record.licenseNumber || licenses.has(record.licenseNumber)) throw new Error("Invalid license");
      licenses.add(record.licenseNumber);
      return record;
    });
    cache = { key, records };
    return records;
  } catch {
    throw new MedicineChatError(503, "The medicine CSV cannot be read or has an invalid format. Please contact the administrator.");
  }
}

export function searchCatalog(query, { env = process.env, limit = 8 } = {}) {
  const records = loadCatalog(env);
  const normalized = normalize(query);
  if (normalized.length < 2) return { records: [], total: 0, recordCount: records.length };
  const tokens = [...new Set(query.normalize("NFKC").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])]
    .filter((word) => !["what", "this", "that", "color", "shape", "does", "the", "are", "and", "for", "how", "please", "tell", "about"].includes(word)).slice(0, 30);
  const numbers = query.normalize("NFKC").match(/\d+(?:\.\d+)?/g) || [];
  const han = query.normalize("NFKC").match(/[\p{Script=Han}]+/gu) || [];
  const fragments = new Set();
  for (const phrase of han) {
    for (let length = Math.min(phrase.length, 16); length >= 2; length--) {
      for (let i = 0; i <= phrase.length - length && fragments.size < 512; i++) fragments.add(phrase.slice(i, i + length));
    }
  }
  const scored = records.map((record) => {
    const names = [record.chineseName, record.englishName].map(normalize).filter(Boolean);
    const license = normalize(record.licenseNumber);
    let score = 0;
    if (normalized.includes(license)) score = 1000;
    else if (names.some((name) => normalized === name)) score = 900;
    else if (names.some((name) => name.length >= 3 && normalized.includes(name))) score = 800;
    else if ([license, ...names].some((name) => name.includes(normalized))) score = 500;
    else {
      const longest = [...fragments].reduce((best, fragment) => names.some((name) => name.includes(fragment)) ? Math.max(best, fragment.length) : best, 0);
      const english = record.englishName.toLowerCase().match(/[a-z0-9]+/g) || [];
      const tokenCount = tokens.filter((word) => english.includes(word)).length;
      score = longest * 10 + tokenCount * 25;
      if (numbers.length && !numbers.every((number) => `${record.chineseName} ${record.englishName}`.normalize("NFKC").match(/\d+(?:\.\d+)?/g)?.includes(number))) score = 0;
    }
    return { record, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.record.licenseNumber.localeCompare(b.record.licenseNumber));
  // Prefer explicit names/licenses over incidental fragments, but never select one
  // formulation merely because it is the first row for a shared brand name.
  const best = scored[0]?.score || 0;
  const matches = scored.filter(({ score }) => best >= 800 ? score >= 800 : score === best);
  return { records: matches.slice(0, limit).map(({ record }) => record), total: matches.length, recordCount: records.length };
}

export function resolveMedicineContext({ message, selectedMedicineId, recognition, history = [] }, env = process.env) {
  const all = loadCatalog(env);
  let result;
  if (selectedMedicineId) {
    const record = all.find((item) => item.licenseNumber === selectedMedicineId);
    if (!record) throw new MedicineChatError(404, "The selected medicine is not in the dataset. Search again.");
    result = { records: [record], total: 1, recordCount: all.length };
  } else {
    result = searchCatalog(message, { env });
    if (!result.total && recognition) {
      result = searchCatalog([recognition.text || "", ...(recognition.medications || []).map((item) => item.name)].join(" "), { env });
    }
    // Only reuse a user-named medicine for an explicit follow-up, never rely on
    // assistant-generated drug names or silently reuse a previous drug for a new one.
    const followUp = /^(?:它|這顆|這個|這款|該藥|那顆|那個)/u.test(message.trim()) ||
      /^(?:請問|請說明|請|有|是|的|什麼|甚麼|哪種|哪些|顏色|形狀|刻痕|標註|外觀|尺寸|用途|副作用|劑量|嗎|呢|？|\?|\s)+$/u.test(message);
    if (!result.total && followUp) {
      for (const previous of history.filter((item) => item.role === "user").reverse()) {
        result = searchCatalog(previous.content, { env });
        if (result.total) break;
      }
    }
  }
  return {
    sources: result.records,
    catalog: { fileName: "42_2.csv", recordCount: result.recordCount, matchedCount: result.total,
      status: result.total === 0 ? "not_found" : result.total === 1 ? "matched" : "ambiguous" },
  };
}
