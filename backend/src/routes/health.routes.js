export default async function healthRoutes(app) {
  app.get("/", async () => ({
    ok: true,
    message: "success",
    service: "cloudphone-backend",
    timestamp: new Date().toISOString(),
  }));

  app.get("/health", async () => ({
    ok: true,
    service: "cloudphone-backend",
    timestamp: new Date().toISOString(),
  }));
}
