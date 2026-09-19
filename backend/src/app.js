import Fastify from "fastify";
import cors from "@fastify/cors";
import docsRoutes from "./routes/docs.routes.js";
import healthRoutes from "./routes/health.routes.js";
import smsRoutes from "./routes/sms.routes.js";

const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const enableTestSmsEndpoint = process.env.ENABLE_TEST_SMS_ENDPOINT === "true";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  credentials: true,
});

app.setNotFoundHandler((request, reply) => {
  return reply.code(404).send({
    ok: false,
    error: "Route not found",
    path: request.url,
  });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Unhandled request error");

  if (reply.sent) {
    return;
  }

  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return reply.code(statusCode).send({
    ok: false,
    error: statusCode >= 500 ? "Internal Server Error" : error.message,
  });
});

await app.register(healthRoutes);
await app.register(docsRoutes);
await app.register(smsRoutes, { enableTestSmsEndpoint });

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`CloudPhone backend running on http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
