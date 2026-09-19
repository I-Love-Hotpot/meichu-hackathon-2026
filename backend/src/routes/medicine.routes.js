import { readFileSync } from "node:fs";
import { askMedicine, MedicineChatError } from "../services/gemini.service.js";
import { searchCatalog } from "../services/medicine-catalog.service.js";
import { translateMedicineRecords } from "../services/google-translate.service.js";

const document = JSON.parse(
  readFileSync(new URL("../../api-docs/swagger.json", import.meta.url), "utf8"),
);
const schemas = document.components.schemas;

// Resolve the OpenAPI references so runtime validation uses the published contract.
function resolveSchema(value) {
  if (Array.isArray(value)) return value.map(resolveSchema);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) return resolveSchema(schemas[value.$ref.split("/").pop()]);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, resolveSchema(child)]),
  );
}

export default async function medicineRoutes(
  app,
  { ask = askMedicine, translateRecords = translateMedicineRecords } = {},
) {
  app.get(
    "/api/medicine/search",
    {
      schema: { querystring: resolveSchema(schemas.MedicineSearchQuery) },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError)
        return reply
          .code(400)
          .send({
            ok: false,
            error:
              "Enter 2 to 200 characters from a medicine name or license identifier.",
          });
      try {
        const result = searchCatalog(request.query.q);
        return {
          ok: true,
          query: request.query.q,
          source: "42_2.csv",
          ...result,
          records: await translateRecords(result.records),
        };
      } catch (error) {
        const known = error instanceof MedicineChatError;
        const statusCode = known ? error.statusCode : 503;
        request.log.error(
          { err: error, statusCode },
          "Medicine search request failed",
        );
        return reply
          .code(statusCode)
          .send({
            ok: false,
            error: known
              ? error.message
              : "The medicine dataset is temporarily unavailable.",
          });
      }
    },
  );
  const requestSchema = resolveSchema(schemas.MedicineChatRequest);
  const replySchema = resolveSchema(schemas.MedicineAnswer);
  app.post(
    "/api/medicine/chat",
    {
      bodyLimit: 256 * 1024,
      attachValidation: true,
      schema: { body: requestSchema },
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply
          .code(400)
          .send({
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
        return reply
          .code(400)
          .send({
            ok: false,
            error:
              "History must contain alternating user and assistant messages in complete pairs.",
          });
      }
      try {
        const result = await ask(request.body);
        // Do not trust a provider's structured-output promise without checking it.
        const validate = request.compileValidationSchema(replySchema);
        if (!validate(result.reply))
          throw new MedicineChatError(
            502,
            "The medicine assistant returned an invalid response. Please try again.",
          );
        return result;
      } catch (error) {
        const known = error instanceof MedicineChatError;
        const statusCode = known ? error.statusCode : 502;
        request.log.warn({ statusCode }, "Medicine chat request failed");
        return reply
          .code(statusCode)
          .send({
            ok: false,
            error: known
              ? error.message
              : "The medicine assistant is temporarily unavailable. Please try again.",
          });
      }
    },
  );
}
