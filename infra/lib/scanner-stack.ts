import { join } from "node:path";
import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface ScannerStackProps extends StackProps {
  vpc: ec2.IVpc;
  /** ACM certificate (in this region) for the scanner's https listener. The app requires an https CLAMAV_URL. */
  certificateArn: string;
}

/**
 * The malware scanner of ADR 0012 on ECS Fargate: the infra/clamav-scanner image behind an internal https ALB.
 * Its own service (not in the API task) because clamd needs ~2 GB resident. The app reaches it at CLAMAV_URL
 * (the ALB DNS name or a record you point at it) with the token held in the secret created here.
 */
export class ScannerStack extends Stack {
  readonly authToken: secretsmanager.Secret;
  readonly service: patterns.ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: ScannerStackProps) {
    super(scope, id, props);

    // Same value goes into the app's CLAMAV_AUTH_TOKEN (read it from Secrets Manager).
    this.authToken = new secretsmanager.Secret(this, "AuthToken", {
      description: "Bearer token for the LOOP ClamAV scanner (CLAMAV_AUTH_TOKEN)",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    this.service = new patterns.ApplicationLoadBalancedFargateService(this, "Service", {
      vpc: props.vpc,
      cpu: 1024,
      memoryLimitMiB: 2048,
      desiredCount: 1,
      publicLoadBalancer: false,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificate: acm.Certificate.fromCertificateArn(this, "Cert", props.certificateArn),
      redirectHTTP: false,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      // clamd loads ~100 MB of signatures on start; give it room before the health check can fail the task.
      healthCheckGracePeriod: Duration.minutes(5),
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(join(import.meta.dirname, "../clamav-scanner")),
        containerPort: 8080,
        secrets: { AUTH_TOKEN: ecs.Secret.fromSecretsManager(this.authToken) },
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: "clamav-scanner" }),
      },
    });
    this.service.targetGroup.configureHealthCheck({ path: "/healthz", healthyHttpCodes: "200", interval: Duration.seconds(30) });
    // The API's tasks (or the host running the app) must be allowed in; add their security group here when ServiceStack exists.
    this.service.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 3 }).scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 60 });
  }
}
