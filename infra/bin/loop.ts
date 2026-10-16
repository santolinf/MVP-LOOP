import { App } from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { SecretsStack } from "../lib/secrets-stack.js";
import { ServiceStack } from "../lib/service-stack.js";
import { MonitoringStack } from "../lib/monitoring-stack.js";

const app = new App();
const env = { region: "eu-west-2" };
new NetworkStack(app, "LoopNetwork", { env });
new DataStack(app, "LoopData", { env });
new StorageStack(app, "LoopStorage", { env });
new SecretsStack(app, "LoopSecrets", { env });
new ServiceStack(app, "LoopService", { env });
new MonitoringStack(app, "LoopMonitoring", { env });
