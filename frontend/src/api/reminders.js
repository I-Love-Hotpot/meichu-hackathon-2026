import { requestJson } from "./medicine.js";

/**
 * Register (or update) the phone number and daily reminder times ("HH:MM")
 * the backend should use to send medication reminder SMS.
 *
 * @param {{ phone: string, times: string[] }} params
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function registerReminderPhone({ phone, times }, { signal } = {}) {
  return requestJson("/api/reminders/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, times }),
    signal,
  });
}
