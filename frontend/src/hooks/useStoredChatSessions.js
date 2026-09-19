import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "medaboutyou-chat-sessions";
const SCHEMA_VERSION = 1;
const MAX_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 40;
const MAX_SOURCES_PER_MESSAGE = 8;
const MAX_STORAGE_CHARACTERS = 2_000_000;

const medicineFields = [
  "recordId",
  "displayName",
  "englishName",
  "licenseNumber",
  "strength",
];

const sourceFields = [
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

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clippedString = (value, maxLength = 8000) =>
  typeof value === "string" ? value.slice(0, maxLength) : "";

const validTimestamp = (value, fallback) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : fallback;

export function createChatEntityId(prefix = "chat") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function snapshotChatMedicine(medicine) {
  if (!isObject(medicine)) return null;
  const snapshot = {};
  medicineFields.forEach((field) => {
    if (typeof medicine[field] === "string" && medicine[field]) {
      snapshot[field] = clippedString(medicine[field], 1000);
    }
  });
  return Object.keys(snapshot).length ? snapshot : null;
}

function sanitizeSource(source) {
  if (!isObject(source)) return null;
  const snapshot = {};
  sourceFields.forEach((field) => {
    if (typeof source[field] === "string") {
      snapshot[field] = clippedString(source[field], 3000);
    }
  });
  return snapshot.recordId ? snapshot : null;
}

function sanitizeReply(reply, fallbackContent) {
  if (!isObject(reply)) return null;
  return {
    answer: clippedString(reply.answer || fallbackContent),
    warnings: Array.isArray(reply.warnings)
      ? reply.warnings
          .filter((item) => typeof item === "string")
          .slice(0, 20)
          .map((item) => clippedString(item, 2000))
      : [],
    followUpQuestions: Array.isArray(reply.followUpQuestions)
      ? reply.followUpQuestions
          .filter((item) => typeof item === "string")
          .slice(0, 20)
          .map((item) => clippedString(item, 2000))
      : [],
  };
}

function sanitizeMessage(message) {
  if (!isObject(message) || !["user", "assistant"].includes(message.role)) {
    return null;
  }
  const content = clippedString(message.content);
  if (!content.trim()) return null;
  const createdAt = validTimestamp(message.createdAt, new Date().toISOString());
  const sanitized = {
    id:
      typeof message.id === "string" && message.id
        ? message.id
        : createChatEntityId("message"),
    role: message.role,
    content,
    createdAt,
  };
  if (message.role === "assistant") {
    const reply = sanitizeReply(message.reply, content);
    if (reply) sanitized.reply = reply;
    if (Array.isArray(message.sources)) {
      sanitized.sources = message.sources
        .slice(0, MAX_SOURCES_PER_MESSAGE)
        .map(sanitizeSource)
        .filter(Boolean);
    }
    if (isObject(message.catalog)) {
      sanitized.catalog = {
        status: ["matched", "ambiguous", "not_found"].includes(
          message.catalog.status,
        )
          ? message.catalog.status
          : "not_found",
        fileName: clippedString(message.catalog.fileName, 200),
      };
    }
  }
  return sanitized;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const normalized = messages.map(sanitizeMessage).filter(Boolean);
  const completePairs = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const user = normalized[index];
    const assistant = normalized[index + 1];
    if (user.role !== "user" || assistant.role !== "assistant") continue;
    completePairs.push(user, assistant);
    index += 1;
  }
  return completePairs.slice(-MAX_MESSAGES_PER_SESSION);
}

function sanitizeSession(session) {
  if (!isObject(session) || typeof session.id !== "string" || !session.id) {
    return null;
  }
  const messages = sanitizeMessages(session.messages);
  if (!messages.length) return null;
  const now = new Date().toISOString();
  const updatedAt = validTimestamp(session.updatedAt, now);
  return {
    id: session.id,
    createdAt: validTimestamp(session.createdAt, updatedAt),
    updatedAt,
    locale: clippedString(session.locale, 20),
    title: clippedString(session.title, 80),
    medicine: snapshotChatMedicine(session.medicine),
    messages,
    disclaimer: clippedString(session.disclaimer, 4000),
    requiresPackageText: session.requiresPackageText === true,
  };
}

function limitSessions(value) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  const sessions = value
    .map(sanitizeSession)
    .filter((session) => {
      if (!session || seenIds.has(session.id)) return false;
      seenIds.add(session.id);
      return true;
    })
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, MAX_SESSIONS);

  const storedLength = () =>
    JSON.stringify({ version: SCHEMA_VERSION, sessions }).length;
  while (
    sessions.length > 1 &&
    storedLength() > MAX_STORAGE_CHARACTERS
  ) {
    sessions.pop();
  }
  while (
    sessions.length === 1 &&
    sessions[0].messages.length > 2 &&
    storedLength() > MAX_STORAGE_CHARACTERS
  ) {
    sessions[0] = {
      ...sessions[0],
      messages: sessions[0].messages.slice(2),
    };
  }
  return sessions;
}

function parseStoredSessions(value) {
  try {
    const stored = JSON.parse(value || "null");
    if (!isObject(stored) || stored.version !== SCHEMA_VERSION) return [];
    return limitSessions(stored.sessions);
  } catch {
    return [];
  }
}

function readStoredSessions() {
  return parseStoredSessions(localStorage.getItem(STORAGE_KEY));
}

export function useStoredChatSessions() {
  const [sessions, setSessions] = useState(readStoredSessions);

  const updateSessions = useCallback((nextValue) => {
    setSessions((current) =>
      limitSessions(
        typeof nextValue === "function" ? nextValue(current) : nextValue,
      ),
    );
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      const nextSessions = parseStoredSessions(event.newValue);
      setSessions((current) =>
        JSON.stringify(current) === JSON.stringify(nextSessions)
          ? current
          : nextSessions,
      );
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, sessions }),
      );
    } catch {
      // Chat remains available in memory when browser storage is unavailable.
    }
  }, [sessions]);

  return [sessions, updateSessions];
}
