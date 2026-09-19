import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/services/medicine-catalog.service.js";

const source = fileURLToPath(new URL("../../data/db/42_2.csv", import.meta.url));
const target = new URL("../resources/42_2.csv", import.meta.url);
const records = loadCatalog({ MEDICINE_CSV_PATH: source });
mkdirSync(new URL("../resources/", import.meta.url), { recursive: true });
copyFileSync(source, target);
console.log(`Synced ${records.length} medicine records from data/db/42_2.csv to backend/resources/42_2.csv`);
