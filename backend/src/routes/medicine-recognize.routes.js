import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMedicineRepository } from "../services/medicine-database.service.js";
import {
  MedicineRecognitionError,
  recognizeMedicineImage,
} from "../services/medicine-recognition.service.js";

const maxImageBytes = 10 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const fileExtension = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export default async function medicineRecognizeRoutes(
  app,
  { repository = createMedicineRepository(), recognize = recognizeMedicineImage } = {},
) {
  app.addHook("onClose", async () => repository.close());

  app.post("/api/medicine/recognize", async (request, reply) => {
    let upload;
    try {
      upload = await request.file({ limits: { files: 1, fileSize: maxImageBytes } });
    } catch (error) {
      if (error.code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ ok: false, error: "Image must not exceed 10 MiB." });
      }
      return reply.code(400).send({ ok: false, error: "Provide one image file in the `image` field." });
    }

    if (!upload || upload.fieldname !== "image" || !imageTypes.has(upload.mimetype)) {
      return reply.code(400).send({
        ok: false,
        error: "Provide one JPEG, PNG, or WebP image in the `image` field.",
      });
    }

    const directory = await mkdtemp(join(tmpdir(), "medicine-recognize-"));
    const imagePath = join(directory, `image${fileExtension[upload.mimetype]}`);
    try {
      const image = await upload.toBuffer();
      if (upload.file.truncated || !image.length) {
        return reply.code(upload.file.truncated ? 413 : 400).send({
          ok: false,
          error: upload.file.truncated ? "Image must not exceed 10 MiB." : "Image must not be empty.",
        });
      }
      await writeFile(imagePath, image, { mode: 0o600 });

      const recognition = await recognize(imagePath);
      const medicines = await Promise.all(
        recognition.ids.map(async (licenseNumber) => ({
          license_number: licenseNumber,
          medicine: await repository.findByLicenseNumber(licenseNumber),
        })),
      );
      return { ok: true, recognition, medicines };
    } catch (error) {
      const known = error instanceof MedicineRecognitionError;
      const statusCode = known ? error.statusCode : 503;
      request.log.error({ err: error, statusCode }, "Medicine image recognition request failed");
      return reply.code(statusCode).send({
        ok: false,
        error: known
          ? error.message
          : "The medicine database is temporarily unavailable.",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
