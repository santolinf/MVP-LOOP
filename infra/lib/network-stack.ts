import { Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

// Minimal network: private subnets with one NAT for outbound (the scanner's freshclam needs the internet).
// TODO(spec): size AZs/NAT for production, add VPC endpoints and flow logs.
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 1 });
  }
}
