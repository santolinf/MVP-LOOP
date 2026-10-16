import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

// TODO(spec): define secrets resources (eu-west-2).
export class SecretsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
