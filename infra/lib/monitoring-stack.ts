import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

// TODO(spec): define monitoring resources (eu-west-2).
export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
