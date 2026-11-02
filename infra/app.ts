import { App, DefaultStackSynthesizer, Tags } from "aws-cdk-lib";
import { configuration } from "./config";
import { BackendStack, CertificateStack, FrontendStack } from "./stacks";
import { applyStatsTags } from "./tags";
const app = new App();
const c = configuration(
  app.node.tryGetContext("validation") === true ||
    app.node.tryGetContext("validation") === "true",
);
applyStatsTags(app, c.environment);
const synth = () => new DefaultStackSynthesizer({ qualifier: "stats7028" });
new CertificateStack(app, `stats-${c.environment}-certificate`, {
  config: c,
  env: { account: c.account, region: "us-east-1" },
  synthesizer: synth(),
});
if (
  app.node.tryGetContext("certificateOnly") !== "true" &&
  app.node.tryGetContext("certificateOnly") !== true
) {
  if (!c.certificateArn)
    throw new Error(
      "Deploy the Stats certificate stack with -c certificateOnly=true, then set STATS_CERTIFICATE_ARN to its output.",
    );
  const backend = new BackendStack(app, `stats-${c.environment}-backend`, {
    config: c,
    env: { account: c.account, region: "us-east-2" },
    synthesizer: synth(),
  });
  new FrontendStack(app, `stats-${c.environment}-frontend`, {
    config: c,
    api: backend.api,
    env: { account: c.account, region: "us-east-2" },
    synthesizer: synth(),
  });
}
