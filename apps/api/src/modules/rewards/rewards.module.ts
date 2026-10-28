import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { RewardsController } from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";

@Module({
  controllers: [RewardsController],
  providers: [RewardsService, AuditService],
  exports: [RewardsService],
})
export class RewardsModule {}
