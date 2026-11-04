import type { StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import { resolve } from "node:path";
import type { Config } from "./config";

export type Props = StackProps & { config: Config };
export const projectRoot = resolve(__dirname, "../..");
export const zone = (scope: Construct, c: Config) =>
  route53.HostedZone.fromHostedZoneAttributes(scope, "Zone", {
    hostedZoneId: c.zoneId,
    zoneName: c.zoneName,
  });
export const spaCode = `function handler(event) { var r = event.request; if (r.uri === '/' || r.uri === '/hours' || r.uri === '/leaderboard' || r.uri === '/reports') r.uri = '/index.html'; return r; }`;
