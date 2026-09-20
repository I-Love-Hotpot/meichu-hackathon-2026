import { MedicineChatError } from "../services/gemini.service.js";
import { searchCatalog } from "../services/medicine-catalog.service.js";
import { translateMedicineRecords } from "../services/google-translate.service.js";
import {
  medicineSchemas,
  resolveMedicineSchema,
} from "./medicine-route.schemas.js";

export default async function medicineSearchRoutes(
  app,
  { translateRecords = translateMedicineRecords } = {},
) {
  app.get(
    "/api/medicine/search",
    {
      schema: {
        querystring: resolveMedicineSchema(
          medicineSchemas.MedicineSearchQuery,
        ),
      },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          ok: false,
          error:
            "Enter 2 to 200 characters from a medicine name or license identifier.",
        });
      }

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
        return reply.code(statusCode).send({
          ok: false,
          error: known
            ? error.message
            : "The medicine dataset is temporarily unavailable.",
        });
      }
    },
  );
}
