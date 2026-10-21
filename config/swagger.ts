import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const ext = __filename.endsWith(".ts") ? "ts" : "js";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Gyneclinics API",
      version: "1.0.0",
      description: "REST API documentation for the Gyneclinics backend",
    },
    servers: [
      {
        url: `${env.publicUrl}/api/v1`,
        description: `${env.nodeEnv} server`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [
    path.join(__dirname, `../routes/*.${ext}`),
    path.join(__dirname, `../models/*.${ext}`),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

// Swagger UI is loaded from a CDN so the docs page works on Vercel without
// bundling static files.
const swaggerUiVersion = "5.32.13";
const swaggerUiCdn = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${swaggerUiVersion}`;
const serializedSpec = JSON.stringify(swaggerSpec).replace(/</g, "\\u003c");

export const swaggerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gyneclinics API Documentation</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${swaggerUiCdn}/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *::before, *::after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${swaggerUiCdn}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
    <script src="${swaggerUiCdn}/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
    <script>
      window.addEventListener("load", function () {
        window.ui = SwaggerUIBundle({
          spec: ${serializedSpec},
          dom_id: "#swagger-ui",
          deepLinking: true,
          persistAuthorization: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: "StandaloneLayout"
        });
      });
    </script>
  </body>
</html>`;
