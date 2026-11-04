#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { config } from "../lib/config";
import { FrontendStack } from "../lib/frontend-stack";
import { applyStatsTags } from "../lib/tags";

const app = new cdk.App();
applyStatsTags(app);
const props = (region: string): cdk.StackProps => ({
  env: { account: config.account, region },
  crossRegionReferences: true,
});

const certificate = new CertificateStack(
  app,
  "stats-certificate",
  { ...props("us-east-1"), config },
);
const backend = new BackendStack(app, "stats-backend", {
  ...props("us-east-2"),
  config,
});
new FrontendStack(app, "stats-frontend", {
  ...props("us-east-2"),
  config,
  api: backend.api,
  certificate: certificate.certificate,
});
