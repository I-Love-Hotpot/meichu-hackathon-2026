import { sendSms } from "./twilio.service.js";
import { listReminders, markSent } from "./reminder-store.service.js";

const timeZone = "Asia/Taipei";
const slotFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function currentSlot(date = new Date()) {
  const parts = Object.fromEntries(
    slotFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}

async function tick(logger) {
  const { dateStr, hhmm } = currentSlot();
  const reminders = await listReminders();

  for (const reminder of reminders) {
    if (!reminder.times.includes(hhmm)) continue;

    const slotKey = `${dateStr}T${hhmm}`;
    if (reminder.sentLog?.[slotKey]) continue;

    try {
      await sendSms({ to: reminder.phone });
      await markSent(reminder.phone, slotKey);
    } catch (error) {
      logger?.error(
        { err: error, phone: reminder.phone },
        "Failed to send medication reminder SMS",
      );
    }
  }
}

/**
 * Start a periodic check that sends a medication reminder SMS to every
 * registered phone number whose reminder times match the current time
 * (Asia/Taipei). Returns a function that stops the scheduler.
 *
 * @param {{ intervalMs?: number, logger?: import("fastify").FastifyBaseLogger }} [options]
 */
export function startReminderScheduler({ intervalMs = 30000, logger } = {}) {
  const timer = setInterval(() => {
    tick(logger).catch((error) => {
      logger?.error({ err: error }, "Reminder scheduler tick failed");
    });
  }, intervalMs);

  timer.unref?.();

  return () => clearInterval(timer);
}
