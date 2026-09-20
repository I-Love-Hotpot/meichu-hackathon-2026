import { askMedicine, MedicineChatError } from "../services/gemini.service.js";
import {
  medicineSchemas,
  resolveMedicineSchema,
} from "./medicine-route.schemas.js";

export default async function medicineChatRoutes(
  app,
  { ask = askMedicine } = {},
) {
  const requestSchema = resolveMedicineSchema(
    medicineSchemas.MedicineChatRequest,
  );
  const replySchema = resolveMedicineSchema(medicineSchemas.MedicineAnswer);

  app.post(
    "/api/medicine/chat",
    {
      bodyLimit: 256 * 1024,
      attachValidation: true,
      schema: { body: requestSchema },
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          ok: false,
          error:
            "Provide a valid message, conversation history, and recognition data. See the API documentation for the required format.",
        });
      }

      const { history = [] } = request.body;
      if (
        history.length % 2 !== 0 ||
        history.some(
          (item, i) => item.role !== (i % 2 === 0 ? "user" : "assistant"),
        )
      ) {
        return reply.code(400).send({
          ok: false,
          error:
            "History must contain alternating user and assistant messages in complete pairs.",
        });
      }

      try {
        const result = await ask(request.body);
        // Do not trust a provider's structured-output promise without checking it.
        const validate = request.compileValidationSchema(replySchema);
        if (!validate(result.reply)) {
          throw new MedicineChatError(
            502,
            "The medicine assistant returned an invalid response. Please try again.",
          );
        }
        return result;
      } catch (error) {
        const known = error instanceof MedicineChatError;
        const statusCode = known ? error.statusCode : 502;
        request.log.warn({ statusCode }, "Medicine chat request failed");
        return reply.code(statusCode).send({
          ok: false,
          error: known
            ? error.message
            : "The medicine assistant is temporarily unavailable. Please try again.",
        });
      }
    },
  );
}
