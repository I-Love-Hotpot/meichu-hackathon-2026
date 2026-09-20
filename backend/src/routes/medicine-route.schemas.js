import { readFileSync } from "node:fs";

const document = JSON.parse(
  readFileSync(new URL("../../api-docs/swagger.json", import.meta.url), "utf8"),
);

export const medicineSchemas = document.components.schemas;

// Resolve the OpenAPI references so runtime validation uses the published contract.
export function resolveMedicineSchema(value) {
  if (Array.isArray(value)) return value.map(resolveMedicineSchema);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) {
    return resolveMedicineSchema(
      medicineSchemas[value.$ref.split("/").pop()],
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolveMedicineSchema(child),
    ]),
  );
}
