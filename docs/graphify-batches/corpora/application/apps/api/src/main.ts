import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

@Controller("health")
class HealthController {
  @Get("ready")
  ready() {
    return {
      status: "ready",
      service: "creozentic-api",
      version: process.env.RELEASE_VERSION ?? "dev",
    };
  }
}

@Module({ controllers: [HealthController] })
class ApiModule {}

export async function createApi() {
  const app = await NestFactory.create<NestFastifyApplication>(ApiModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  const config = new DocumentBuilder()
    .setTitle("Creozentic API")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  await app.listen({
    port: Number(process.env.API_PORT ?? 4000),
    host: process.env.API_HOST ?? "0.0.0.0",
  });
  return app;
}

if (process.env.RUN_API === "true") void createApi();
