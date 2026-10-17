import { Module } from "@nestjs/common";
import { PublicConfigController } from "./public-config.controller.js";
import { PublicConfigService } from "./public-config.service.js";

@Module({ controllers: [PublicConfigController], providers: [PublicConfigService] })
export class PublicModule {}
