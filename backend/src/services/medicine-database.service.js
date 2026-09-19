import mysql from "mysql2/promise";

const lookupByLicenseNumberSql = `
  SELECT *
  FROM medicines
  WHERE license_number = ?
  ORDER BY id
  LIMIT 1
`;

const lookupByPillIdSql = `
  SELECT *
  FROM medicines
  WHERE license_number LIKE CONCAT('%第', ?, '號')
  ORDER BY id
`;

export function createMedicineRepository({ env = process.env, createPool = mysql.createPool } = {}) {
  let pool;

  function getPool() {
    if (pool) return pool;
    const port = Number(env.DB_PORT || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Invalid DB_PORT configuration");
    }
    pool = createPool({
      host: env.DB_HOST || "127.0.0.1",
      port,
      user: env.DB_USER || "root",
      password: env.DB_PASSWORD ?? "",
      database: env.DB_DATABASE || "backend",
      charset: "utf8mb4",
      connectTimeout: 5000,
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 20,
    });
    return pool;
  }

  return {
    async findByLicenseNumber(licenseNumber) {
      const [rows] = await getPool().execute(
        { sql: lookupByLicenseNumberSql, timeout: 5000 },
        [licenseNumber],
      );
      return rows[0] ?? null;
    },
    async findAllByPillId(pillId) {
      if (typeof pillId !== "string" || !/^\d{6}$/.test(pillId)) {
        throw new Error("Invalid pill ID");
      }
      const [rows] = await getPool().execute(
        { sql: lookupByPillIdSql, timeout: 5000 },
        [pillId],
      );
      return rows;
    },
    async close() {
      if (pool) {
        await pool.end();
        pool = undefined;
      }
    },
  };
}
