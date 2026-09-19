import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
const dataFile = path.join(dataDir, "reminders.json");

let cache;
let loadPromise;

async function load() {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await readFile(dataFile, "utf8");
        cache = new Map(Object.entries(JSON.parse(raw)));
      } catch {
        cache = new Map();
      }
      return cache;
    })();
  }
  return loadPromise;
}

async function persist() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    dataFile,
    JSON.stringify(Object.fromEntries(cache), null, 2),
    "utf8",
  );
}

/**
 * Register (or update) the reminder times for a phone number.
 *
 * @param {string} phone
 * @param {string[]} times "HH:MM" strings
 */
export async function upsertReminder(phone, times) {
  await load();
  const existing = cache.get(phone);
  cache.set(phone, { phone, times, sentLog: existing?.sentLog || {} });
  await persist();
}

export async function removeReminder(phone) {
  await load();
  cache.delete(phone);
  await persist();
}

export async function listReminders() {
  await load();
  return [...cache.values()];
}

/**
 * Mark a reminder time slot as sent so the scheduler does not resend it, and
 * prune slots from previous days to keep the log small.
 *
 * @param {string} phone
 * @param {string} slotKey e.g. "2026-09-20T08:00"
 */
export async function markSent(phone, slotKey) {
  await load();
  const entry = cache.get(phone);
  if (!entry) return;
  const today = slotKey.slice(0, 10);
  entry.sentLog = Object.fromEntries(
    Object.entries({ ...entry.sentLog, [slotKey]: true }).filter(([key]) =>
      key.startsWith(today),
    ),
  );
  await persist();
}
