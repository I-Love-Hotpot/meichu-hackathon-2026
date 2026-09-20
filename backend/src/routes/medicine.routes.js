import medicineChatRoutes from "./medicine-chat.routes.js";
import medicineRecognitionRoutes from "./medicine-recognition.routes.js";
import medicineSearchRoutes from "./medicine-search.routes.js";

export default async function medicineRoutes(app, options = {}) {
  await medicineSearchRoutes(app, {
    translateRecords: options.translateRecords,
  });
  await medicineChatRoutes(app, { ask: options.ask });
  await medicineRecognitionRoutes(app, {
    recognize: options.recognize,
    recognitionRepository: options.recognitionRepository,
  });
}
