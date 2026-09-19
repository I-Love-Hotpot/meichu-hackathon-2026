import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "medaboutyou-dose-log";
const LEGACY_STORAGE_KEY = "medaboutyou-today-doses";
const INITIAL_DAYS_SEED_KEY = "medaboutyou-dose-log-initial-days-v1";
const SCHEMA_VERSION = 3;
const MIGRATABLE_SCHEMA_VERSIONS = new Set([1, 2, SCHEMA_VERSION]);
const MAX_DAYS = 90;
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clippedString = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function getLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  return getLocalDateKey(new Date(year, month - 1, day, 12)) === value;
}

function sanitizeTimestamp(value, fallback) {
  return typeof value === "string" &&
    value.length <= 100 &&
    Number.isFinite(Date.parse(value))
    ? value
    : fallback;
}

function sanitizeAmount(value) {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(amount) && amount > 0 && amount <= 99.5
    ? amount
    : null;
}

function sanitizeDose(value) {
  if (!isObject(value)) return null;
  const id = clippedString(value.id, 200);
  const medicineId = clippedString(value.medicineId, 200);
  const time = clippedString(value.time, 5);
  const amount = sanitizeAmount(value.amount);
  const unit = clippedString(value.unit, 80);
  if (
    !id ||
    !medicineId ||
    !TIME_PATTERN.test(time) ||
    amount === null ||
    !unit ||
    typeof value.taken !== "boolean"
  ) {
    return null;
  }

  const dose = {
    id,
    medicineId,
    time,
    amount,
    unit,
    taken: value.taken,
  };
  const medicineName = clippedString(value.medicineName, 500);
  if (medicineName) dose.medicineName = medicineName;
  return dose;
}

function sanitizeDoses(value) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  return value.map(sanitizeDose).filter((dose) => {
    if (!dose || seenIds.has(dose.id)) return false;
    seenIds.add(dose.id);
    return true;
  });
}

function sanitizeDay(value, fallbackTimestamp) {
  if (
    !isObject(value) ||
    !isValidDateKey(value.date) ||
    !Array.isArray(value.doses)
  ) {
    return null;
  }
  return {
    date: value.date,
    updatedAt: sanitizeTimestamp(value.updatedAt, fallbackTimestamp),
    doses: sanitizeDoses(value.doses),
  };
}

function newerTimestamp(left, right) {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function mergeDuplicateDays(left, right) {
  const rightIsNewer = Date.parse(right.updatedAt) > Date.parse(left.updatedAt);
  const primary = rightIsNewer ? right : left;
  const secondary = rightIsNewer ? left : right;
  return {
    date: primary.date,
    updatedAt: newerTimestamp(primary.updatedAt, secondary.updatedAt),
    doses: sanitizeDoses([...primary.doses, ...secondary.doses]),
  };
}

function limitDays(value) {
  if (!Array.isArray(value)) return [];
  const fallbackTimestamp = new Date().toISOString();
  const daysByDate = new Map();
  value.forEach((item) => {
    const day = sanitizeDay(item, fallbackTimestamp);
    if (!day) return;
    const existing = daysByDate.get(day.date);
    daysByDate.set(
      day.date,
      existing ? mergeDuplicateDays(existing, day) : day,
    );
  });
  return [...daysByDate.values()]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MAX_DAYS);
}

function parseStoredDoseLog(value) {
  try {
    const stored = JSON.parse(value || "null");
    if (
      !isObject(stored) ||
      !MIGRATABLE_SCHEMA_VERSIONS.has(stored.version) ||
      !Array.isArray(stored.days)
    ) {
      return { valid: false, version: null, days: [] };
    }
    return {
      valid: true,
      version: stored.version,
      days: limitDays(stored.days),
    };
  } catch {
    return { valid: false, version: null, days: [] };
  }
}

function parseLegacyDoses(value) {
  try {
    const stored = JSON.parse(value || "null");
    return Array.isArray(stored) ? sanitizeDoses(stored) : null;
  } catch {
    return null;
  }
}

function safeGetItem(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function createTodayEntry(todayKey, doses) {
  return {
    date: todayKey,
    updatedAt: new Date().toISOString(),
    doses: sanitizeDoses(doses),
  };
}

function ensureTodayEntry(days, initialDoses, todayKey) {
  const normalized = limitDays(days);
  if (normalized.some((day) => day.date === todayKey)) return normalized;
  return limitDays([createTodayEntry(todayKey, initialDoses), ...normalized]);
}

function mergeMissingInitialDays(days, initialDays) {
  const normalized = limitDays(days);
  const existingDates = new Set(normalized.map((day) => day.date));
  const missingDays = limitDays(initialDays).filter(
    (day) => !existingDates.has(day.date),
  );
  return limitDays([...normalized, ...missingDays]);
}

function resolveStoredDays(value, initialDoses, initialDays, todayKey) {
  const current = parseStoredDoseLog(value);
  const hasToday = current.days.some((day) => day.date === todayKey);
  const legacyDoses =
    !current.valid && !hasToday
      ? parseLegacyDoses(safeGetItem(LEGACY_STORAGE_KEY))
      : null;
  const daysWithToday = hasToday
    ? current.days
    : ensureTodayEntry(
        current.days,
        legacyDoses === null ? initialDoses : legacyDoses,
        todayKey,
      );
  return current.version === SCHEMA_VERSION
    ? daysWithToday
    : mergeMissingInitialDays(daysWithToday, initialDays);
}

function normalizeHookArguments(initialDays, todayKey) {
  return typeof initialDays === "string" && todayKey === undefined
    ? { initialDays: [], todayKey: initialDays }
    : {
        initialDays: Array.isArray(initialDays) ? initialDays : [],
        todayKey,
      };
}

function resolveTodayKey(value) {
  return isValidDateKey(value) ? value : getLocalDateKey();
}

function sanitizeInitialDays(value) {
  return limitDays(value).map((day) => ({
    ...day,
    doses: day.doses.map((dose) => ({ ...dose })),
  }));
}

function resolveInitialState(initialDoses, initialDays, todayKey) {
  return resolveStoredDays(
    safeGetItem(STORAGE_KEY),
    initialDoses,
    initialDays,
    todayKey,
  );
}

const sameDays = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

export function useStoredDoseLog(initialDoses, initialDays = [], todayKey) {
  const normalizedArguments = normalizeHookArguments(initialDays, todayKey);
  const resolvedTodayKey = resolveTodayKey(normalizedArguments.todayKey);
  const sanitizedInitialDoses = useMemo(
    () => sanitizeDoses(initialDoses),
    [initialDoses],
  );
  const sanitizedInitialDays = useMemo(
    () => sanitizeInitialDays(normalizedArguments.initialDays),
    [normalizedArguments.initialDays],
  );
  const [days, setDays] = useState(() =>
    resolveInitialState(
      sanitizedInitialDoses,
      sanitizedInitialDays,
      resolvedTodayKey,
    ),
  );

  const updateDays = useCallback(
    (nextValue) => {
      setDays((current) => {
        const candidate =
          typeof nextValue === "function" ? nextValue(current) : nextValue;
        const nextDays = ensureTodayEntry(
          candidate,
          sanitizedInitialDoses,
          resolvedTodayKey,
        );
        return sameDays(current, nextDays) ? current : nextDays;
      });
    },
    [resolvedTodayKey, sanitizedInitialDoses],
  );

  useEffect(() => {
    setDays((current) => {
      const nextDays = ensureTodayEntry(
        current,
        sanitizedInitialDoses,
        resolvedTodayKey,
      );
      return sameDays(current, nextDays) ? current : nextDays;
    });
  }, [resolvedTodayKey, sanitizedInitialDoses]);

  useEffect(() => {
    if (
      !sanitizedInitialDays.length ||
      safeGetItem(INITIAL_DAYS_SEED_KEY) === "1"
    ) {
      return;
    }
    setDays((current) => {
      const nextDays = mergeMissingInitialDays(current, sanitizedInitialDays);
      return sameDays(current, nextDays) ? current : nextDays;
    });
    try {
      globalThis.localStorage?.setItem(INITIAL_DAYS_SEED_KEY, "1");
    } catch {
      // The in-memory demo seed still works when storage is unavailable.
    }
  }, [sanitizedInitialDays]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      const nextDays = resolveStoredDays(
        event.newValue,
        sanitizedInitialDoses,
        sanitizedInitialDays,
        resolvedTodayKey,
      );
      setDays((current) =>
        sameDays(current, nextDays) ? current : nextDays,
      );
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [resolvedTodayKey, sanitizedInitialDays, sanitizedInitialDoses]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, days }),
      );
    } catch {
      // Dose history remains available in memory when storage is unavailable.
    }
  }, [days]);

  return [days, updateDays];
}
