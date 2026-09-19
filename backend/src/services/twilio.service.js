import twilio from "twilio";

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
 * Send a plain-text SMS through Twilio.
 *
 * @param {{ to: string, body: string }} params
 * @returns {Promise<import("twilio").Twilio.Api.V2010.MessageInstance>}
 */
export async function sendSms({ to, body } = {}) {
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
