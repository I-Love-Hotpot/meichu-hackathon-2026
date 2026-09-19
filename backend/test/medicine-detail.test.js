import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import medicineDetailRoutes from "../src/routes/medicine-detail.routes.js";
import docsRoutes from "../src/routes/docs.routes.js";
import { createMedicineRepository } from "../src/services/medicine-database.service.js";

const licenseNumber = "內衛成製字第000075號";
const medicine = {
  id: 1,
  license_number: licenseNumber,
  chinese_name: '"福元"蘇打錠500毫克',
  english_name: 'SODIUM BICARBONATE TABLETS "F.Y."',
  shape: "圓形",
  dosage_form: "",
  color: "白",
  odor: "",
  score_line: "無",
  size: "8",
  imprint_1: "FY T061",
  imprint_2: "",
  image_url: "https://mcp.fda.gov.tw/insert/shapeImg/e67be591-893d-4f5b-b0f1-9bb7c38014e9?c=o",
  created_at: "2026-09-19T16:58:24.000Z",
};

async function createApp(t, findByLicenseNumber) {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  await app.register(medicineDetailRoutes, {
    repository: { findByLicenseNumber, close: async () => {} },
  });
  t.after(() => app.close());
  return app;
}

test("license lookup returns the complete database row and trims the query", async (t) => {
  const app = await createApp(t, async (license) => {
    assert.equal(license, licenseNumber);
    return medicine;
  });
  const response = await app.inject({
    method: "GET", url: "/api/medicine", query: { license_number: ` ${licenseNumber} ` },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /application\/json/);
  assert.deepEqual(response.json(), { ok: true, medicine });
});

test("lookup preserves nulls, empty values and multiple image links", async (t) => {
  const row = { ...medicine, color: null, size: "15;;;15", image_url: "https://example.com/a;;;https://example.com/b" };
  const app = await createApp(t, async () => row);
  const response = await app.inject({ method: "GET", url: "/api/medicine", query: { license_number: licenseNumber } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().medicine, row);
});

test("invalid lookup parameters fail before querying the database", async (t) => {
  let calls = 0;
  const app = await createApp(t, async () => { calls++; return medicine; });
  for (const query of [
    {}, { license_number: "" }, { license_number: " \t " }, { license_number: "x".repeat(256) },
    { license_number: licenseNumber, extra: "unexpected" },
  ]) {
    const response = await app.inject({ method: "GET", url: "/api/medicine", query });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().ok, false);
  }
  const repeated = await app.inject("/api/medicine?license_number=one&license_number=two");
  assert.equal(repeated.statusCode, 400);
  assert.equal(calls, 0);
});

test("unknown licenses return 404 and database failures return a sanitized 503", async (t) => {
  for (const [find, status, message] of [
    [async () => null, 404, "Medicine not found."],
    [async () => { throw new Error("password=secret; SELECT private_column FROM medicines"); }, 503,
      "The medicine database is temporarily unavailable."],
  ]) {
    const app = await createApp(t, find);
    const response = await app.inject({ method: "GET", url: "/api/medicine", query: { license_number: "unknown" } });
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.json(), { ok: false, error: message });
  }
});

test("repository binds SQL input, reuses the pool and closes it with the app", async (t) => {
  let creations = 0, executions = 0, closed = 0;
  const input = "' OR 1=1 --";
  const repository = createMedicineRepository({
    env: { DB_HOST: "test-db", DB_PORT: "3307", DB_USER: "reader", DB_PASSWORD: "test-password", DB_DATABASE: "catalog" },
    createPool: (config) => {
      creations++;
      assert.equal(config.host, "test-db");
      assert.equal(config.port, 3307);
      assert.equal(config.user, "reader");
      assert.equal(config.password, "test-password");
      assert.equal(config.database, "catalog");
      assert.equal(config.charset, "utf8mb4");
      return {
        execute: async ({ sql, timeout }, values) => {
          executions++;
          assert.match(sql, /WHERE license_number = \?/);
          assert.equal(sql.includes(input), false);
          assert.ok(timeout > 0);
          assert.deepEqual(values, [input]);
          return [[], []];
        },
        end: async () => { closed++; },
      };
    },
  });
  const app = Fastify();
  t.after(() => app.close());
  await app.register(medicineDetailRoutes, { repository });
  await app.ready();
  assert.equal(creations, 0);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({ method: "GET", url: "/api/medicine", query: { license_number: input } });
    assert.equal(response.statusCode, 404);
  }
  assert.equal(creations, 1);
  assert.equal(executions, 2);
  await app.close();
  assert.equal(closed, 1);
});

test("repository returns the selected database row and rejects invalid port configuration", async () => {
  const repository = createMedicineRepository({
    env: {},
    createPool: () => ({ execute: async () => [[medicine], []], end: async () => {} }),
  });
  assert.deepEqual(await repository.findByLicenseNumber(licenseNumber), medicine);
  await repository.close();
  for (const port of ["bad", "0", "65536", "3.5"]) {
    const invalid = createMedicineRepository({
      env: { DB_PORT: port }, createPool: () => assert.fail("must not create a pool"),
    });
    await assert.rejects(invalid.findByLicenseNumber(licenseNumber), /DB_PORT/);
    await invalid.close();
  }
});

test("repository returns all complete rows matching a six-digit pill ID", async () => {
  const repository = createMedicineRepository({
    env: {},
    createPool: () => ({
      execute: async ({ sql }, values) => {
        assert.match(sql, /SELECT \*/);
        assert.match(sql, /LIKE CONCAT/);
        assert.deepEqual(values, ["000075"]);
        return [[medicine], []];
      },
      end: async () => {},
    }),
  });
  assert.deepEqual(await repository.findAllByPillId("000075"), [medicine]);
  await assert.rejects(repository.findAllByPillId("內衛成製字第000075號"), /pill ID/);
  await repository.close();
});

test("Swagger publishes the database lookup and an example accepted by the route", async (t) => {
  const app = await createApp(t, async () => medicine);
  await app.register(docsRoutes);
  const doc = (await app.inject("/api-docs/swagger.json")).json();
  const operation = doc.paths["/api/medicine"].get;
  assert.deepEqual(Object.keys(operation.responses), ["200", "400", "404", "503"]);
  assert.equal(operation.parameters[0].name, "license_number");
  assert.equal(operation.parameters[0].required, true);
  const example = operation.responses["200"].content["application/json"].example;
  assert.deepEqual(Object.keys(example.medicine).sort(), Object.keys(medicine).sort());
  const response = await app.inject({ method: "GET", url: "/api/medicine", query: { license_number: operation.parameters[0].example } });
  assert.equal(response.statusCode, 200);
});
