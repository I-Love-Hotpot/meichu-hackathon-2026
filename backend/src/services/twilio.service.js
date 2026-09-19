import twilio from "twilio";

// This Twilio account is a trial account. Trial accounts can only send SMS
// using this predefined template as the message body; any other free-form
// text is rejected with "Invalid template name." Once the account is
// upgraded, this restriction can be lifted and callers can pass their own
// `body` again.
export const TRIAL_SMS_TEMPLATE_BODY = "sms_appointment_reminders";

let client;
let clientConfigKey;

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  const missing = [
    ["TWILIO_ACCOUNT_SID", accountSid],
    ["TWILIO_AUTH_TOKEN", authToken],
    ["TWILIO_FROM_NUMBER", from],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Twilio SMS is not configured. Missing environment variables: ${missing.join(", ")}`,
    );
  }

  return { accountSid, authToken, from };
}

function getClient({ accountSid, authToken }) {
  const nextConfigKey = `${accountSid}:${authToken}`;

  if (!client || clientConfigKey !== nextConfigKey) {
    client = twilio(accountSid, authToken);
    clientConfigKey = nextConfigKey;
  }

  return client;
}

/**
 * Send an SMS through Twilio.
 *
 * This account is a trial account, which can only send the predefined
 * `TRIAL_SMS_TEMPLATE_BODY` template as the message body. `body` defaults to
 * that template and should not be overridden until the account is upgraded.
 *
 * @param {{ to: string, body?: string }} params
 * @returns {Promise<import("twilio").Twilio.Api.V2010.MessageInstance>}
 */
export async function sendSms({ to, body = TRIAL_SMS_TEMPLATE_BODY } = {}) {
  if (typeof to !== "string" || !to.trim()) {
    throw new TypeError("SMS recipient `to` must be a non-empty string");
  }

  if (typeof body !== "string" || !body.trim()) {
    throw new TypeError("SMS message `body` must be a non-empty string");
  }

  const config = getConfig();
  const twilioClient = getClient(config);

  return twilioClient.messages.create({
    body,
    from: config.from,
    to: to.trim(),
  });
}
