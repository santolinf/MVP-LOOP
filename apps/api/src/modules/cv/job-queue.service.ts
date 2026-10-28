import { Injectable, Logger } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { loadEnv } from "../../config/index.js";

export const JOB_QUEUE = Symbol("JOB_QUEUE");

export interface JobSendOptions {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  singletonKey?: string;
}

/** Producer side of the job queue; injectable so tests can fake it. */
export interface JobQueue {
  send(name: string, data: object, options?: JobSendOptions): Promise<void>;
}

/** Lazily starts a pg-boss producer (the API process does not run the worker's instance). */
@Injectable()
export class JobQueueService implements JobQueue {
  private readonly logger = new Logger(JobQueueService.name);
  private boss: Promise<PgBoss> | undefined;
  private readonly queues = new Set<string>();

  private start(): Promise<PgBoss> {
    this.boss ??= (async () => {
      const boss = new PgBoss(loadEnv().DATABASE_URL);
      boss.on("error", (err: Error) => this.logger.error(`pg-boss error: ${err.message}`));
      await boss.start();
      return boss;
    })();
    return this.boss;
  }

  async send(name: string, data: object, options: JobSendOptions = {}): Promise<void> {
    const boss = await this.start();
    if (!this.queues.has(name)) {
      await boss.createQueue(name);
      this.queues.add(name);
    }
    await boss.send(name, data, options);
  }
}
