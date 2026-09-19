import Fastify from "fastify";
import cors from "@fastify/cors";

const port = Number(process.env.PORT || 3001);
const cloudphoneBaseUrl = (
  process.env.CLOUDPHONE_BASE_URL || "https://example.com"
).replace(/\/+$/, "");
const cloudphoneWidgetUrl = (
  process.env.CLOUDPHONE_WIDGET_URL || cloudphoneBaseUrl
).replace(/\/+$/, "");
const cloudphoneApiKey = process.env.CLOUDPHONE_API_KEY || "";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  credentials: true,
});

app.get("/health", async () => ({
  ok: true,
  service: "cloudphone-backend",
  timestamp: new Date().toISOString(),
}));

app.get("/api/cloudphone/config", async () => ({
  provider: "cloudmosa",
  baseUrl: cloudphoneBaseUrl,
  widgetUrl: cloudphoneWidgetUrl,
  hasApiKey: Boolean(cloudphoneApiKey),
  env: {
    port,
  },
}));

app.post("/api/cloudphone/widget/launch", async (request, reply) => {
  const {
    path = "/widget",
    method = "POST",
    body = {},
    headers = {},
  } = request.body || {};

  if (!path) {
    return reply.code(400).send({ error: "path is required" });
  }

  const targetUrl = new URL(path, `${cloudphoneBaseUrl}/`);
  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (cloudphoneApiKey) {
    requestHeaders.Authorization = `Bearer ${cloudphoneApiKey}`;
  }

  const response = await fetch(targetUrl, {
    method: String(method).toUpperCase(),
    headers: requestHeaders,
    body: ["GET", "HEAD"].includes(String(method).toUpperCase())
      ? undefined
      : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload;

  try {
    payload = contentType.includes("application/json")
      ? JSON.parse(text)
      : text;
  } catch {
    payload = text;
  }

  return reply.code(response.status).send({
    ok: response.ok,
    status: response.status,
    url: targetUrl.toString(),
    data: payload,
  });
});

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`CloudPhone backend running on http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
