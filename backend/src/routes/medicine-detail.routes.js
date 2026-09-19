import { readFileSync } from "node:fs";
import { createMedicineRepository } from "../services/medicine-database.service.js";

const { components: { schemas } } = JSON.parse(
  readFileSync(new URL("../../api-docs/swagger.json", import.meta.url), "utf8"),
);

export default async function medicineDetailRoutes(app, { repository = createMedicineRepository() } = {}) {
  app.addHook("onClose", async () => repository.close());

  app.get("/api/medicine", {
    attachValidation: true,
    schema: {
      querystring: schemas.MedicineLookupQuery,
      response: {
        200: {
          ...schemas.MedicineLookupResponse,
          properties: {
            ...schemas.MedicineLookupResponse.properties,
            medicine: schemas.MedicineDatabaseRecord,
          },
        },
      },
    },
  }, async (request, reply) => {
    if (request.validationError) {
      return reply.code(400).send({
        ok: false,
        error: "Provide a non-empty license_number of at most 255 characters.",
      });
    }

    try {
      const medicine = await repository.findByLicenseNumber(request.query.license_number.trim());
      if (!medicine) {
        return reply.code(404).send({ ok: false, error: "Medicine not found." });
      }
      return { ok: true, medicine };
    } catch (error) {
      request.log.error({ code: error.code }, "Medicine database lookup failed");
      return reply.code(503).send({
        ok: false,
        error: "The medicine database is temporarily unavailable.",
      });
    }
  });
}
