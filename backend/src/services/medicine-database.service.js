import mysql from "mysql2/promise";

const lookupSql = `
  SELECT id, license_number, chinese_name, english_name, shape, color,
         score_line, size, imprint_1, imprint_2, image_url
  FROM medicines
  WHERE license_number = ?
  ORDER BY id
  LIMIT 1
`;

export function createMedicineRepository({ env = process.env, createPool = mysql.createPool } = {}) {
  let pool;

  return {
    async findByLicenseNumber(licenseNumber) {
      if (!pool) {
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
      }
      const [rows] = await pool.execute(
        { sql: lookupSql, timeout: 5000 },
        [licenseNumber],
      );
      return rows[0] ?? null;
    },
    async close() {
      if (pool) {
        await pool.end();
        pool = undefined;
      }
    },
  };
}
