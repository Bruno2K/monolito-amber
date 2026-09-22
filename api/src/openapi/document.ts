import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Amber API")
    .setDescription(
      "Amber Modular Monolith foundation API. Formal Exception is the sole Gate bypass. Closed 0.2A catalog only.",
    )
    .setVersion("1.6.0")
    .addCookieAuth("amber_session")
    .addTag("health")
    .addTag("auth")
    .addTag("organizations")
    .addTag("projects")
    .addTag("documents")
    .addTag("coordination")
    .addTag("planning")
    .addTag("gates")
    .addTag("exceptions")
    .addTag("catalog")
    .addTag("files")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.openapi = "3.1.0";
  return document;
}
