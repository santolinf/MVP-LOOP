import { Global, Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { loadEnv } from "../../config/index.js";
import { ClamavService } from "./clamav.service.js";
import { CvController } from "./cv.controller.js";
import { CvService } from "./cv.service.js";
import { CvVersionsController } from "./cv-versions.controller.js";
import { CvVersionsService } from "./cv-versions.service.js";
import { DraftService } from "./draft.service.js";
import { EligibilityService } from "./eligibility.service.js";
import { JOB_QUEUE, JobQueueService } from "./job-queue.service.js";
import { CV_ENV, StorageService } from "./storage.service.js";

/** Global so the auth module can adopt anonymous drafts at sign-in, and privacy can queue erasure, without importing this module. */
@Global()
@Module({
  controllers: [CvController, CvVersionsController],
  providers: [{ provide: CV_ENV, useFactory: () => loadEnv() }, StorageService, ClamavService, DraftService, EligibilityService, CvService, CvVersionsService, AuditService, { provide: JOB_QUEUE, useClass: JobQueueService }],
  exports: [DraftService, JOB_QUEUE, StorageService, ClamavService],
})
export class CvModule {}
