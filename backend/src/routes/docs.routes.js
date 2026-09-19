import { readFile } from "node:fs/promises";

export default async function docsRoutes(app) {
  app.get("/api-docs/swagger.json", async () => {
    const filePath = new URL("../../api-docs/swagger.json", import.meta.url);
    const swagger = await readFile(filePath, "utf8");
    return JSON.parse(swagger);
  });

  app.get("/api-docs", async (_request, reply) => {
    const swaggerUrl = "/api-docs/swagger.json";

    return reply.type("text/html; charset=utf-8").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CloudPhone API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      html, body { margin: 0; background: #f5f7fb; }
      #swagger-ui { max-width: 1200px; margin: 20px auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '${swaggerUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
      });
    </script>
  </body>
</html>`);
  });

  app.get("/api-docs/", async (_request, reply) => {
    return reply.redirect("/api-docs");
  });
}
