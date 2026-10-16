import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("LOOP API").setVersion("1").build());
  writeFileSync("../../packages/api-client/openapi.json", JSON.stringify(doc, null, 2));
  await app.close();
}
void main();
