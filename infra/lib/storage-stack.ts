import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

// TODO(spec): define storage resources (eu-west-2).
export class StorageStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
