import {
  removeReminder,
  upsertReminder,
} from "../services/reminder-store.service.js";

const phonePattern = /^\+?[0-9]{6,15}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function reminderRoutes(app) {
  app.post("/api/reminders/register", async (request, reply) => {
    const { phone, times } = request.body || {};

    if (typeof phone !== "string" || !phonePattern.test(phone.trim())) {
      return reply.code(400).send({
        ok: false,
        error: "`phone` must be a valid phone number, e.g. +886912345678",
      });
    }

    if (
      !Array.isArray(times) ||
      !times.every((time) => typeof time === "string" && timePattern.test(time))
    ) {
      return reply.code(400).send({
        ok: false,
        error: '`times` must be an array of "HH:MM" strings',
      });
    }

    const normalizedPhone = phone.trim();
    const normalizedTimes = [...new Set(times)].sort();

    try {
      await upsertReminder(normalizedPhone, normalizedTimes);
    } catch (error) {
      request.log.error({ err: error }, "Failed to save reminder registration");
      return reply.code(500).send({
        ok: false,
        error: "Failed to save reminder registration",
      });
    }

    return { ok: true, phone: normalizedPhone, times: normalizedTimes };
  });

  app.delete("/api/reminders/register", async (request, reply) => {
    const { phone } = request.body || {};

    if (typeof phone !== "string" || !phone.trim()) {
      return reply.code(400).send({
        ok: false,
        error: "`phone` must be a non-empty string",
      });
    }

    try {
      await removeReminder(phone.trim());
    } catch (error) {
      request.log.error(
        { err: error },
        "Failed to remove reminder registration",
      );
      return reply.code(500).send({
        ok: false,
        error: "Failed to remove reminder registration",
      });
    }

    return { ok: true };
  });
}
