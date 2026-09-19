import { sendSms } from "../services/twilio.service.js";

export default async function smsRoutes(app, options = {}) {
  if (!options.enableTestSmsEndpoint) {
    return;
  }

  app.post("/api/sms/test", async (request, reply) => {
    const { to, body } = request.body || {};

    try {
      const message = await sendSms({ to, body });

      return {
        ok: true,
        sid: message.sid,
        status: message.status,
        to: message.to,
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to send test SMS");

      if (error instanceof TypeError) {
        return reply.code(400).send({
          ok: false,
          error: error.message,
        });
      }

      if (error.message?.startsWith("Twilio SMS is not configured")) {
        return reply.code(503).send({
          ok: false,
          error: "Twilio SMS service is not configured",
        });
      }

      return reply.code(502).send({
        ok: false,
        error: "Twilio failed to send the SMS",
      });
    }
  });
}
