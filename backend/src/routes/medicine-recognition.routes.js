import { MedicineChatError } from "../services/gemini.service.js";
import { createMedicineRepository } from "../services/medicine-database.service.js";
import {
  MAX_RECOGNITION_IMAGE_BYTES,
  RECOGNITION_MEDIA_TYPES,
  recognizeMedicineImage,
} from "../services/medicine-recognition.service.js";

export default async function medicineRecognitionRoutes(
  app,
  {
    recognize = recognizeMedicineImage,
    recognitionRepository = createMedicineRepository(),
  } = {},
) {
  app.addHook("onClose", async () => recognitionRepository.close());
  app.addContentTypeParser(
    RECOGNITION_MEDIA_TYPES,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.post(
    "/api/medicine/recognize",
    { bodyLimit: MAX_RECOGNITION_IMAGE_BYTES },
    async (request, reply) => {
      const mediaType = String(request.headers["content-type"] || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return reply
          .code(400)
          .send({ ok: false, error: "Provide a non-empty medicine image." });
      }

      try {
        return await recognize(
          { image: request.body, mediaType },
          { repository: recognitionRepository },
        );
      } catch (error) {
        const known = error instanceof MedicineChatError;
        const statusCode = known ? error.statusCode : 502;
        request.log.warn(
          { statusCode },
          "Medicine recognition request failed",
        );
        return reply.code(statusCode).send({
          ok: false,
          error: known
            ? error.message
            : "Medicine recognition is temporarily unavailable. Please try again.",
        });
      }
    },
  );
}
