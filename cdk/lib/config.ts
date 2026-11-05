export interface Config {
  account: string;
  tableArn: string;
  sourceRegion: string;
  zoneId: string;
  zoneName: string;
  domain: string;
  googleClientId: string;
  googleClientSecretParameter: string;
  allowedDomain: string;
  puncherUrl: string;
  alertEmail?: string;
  repository: string;
  providerArn: string;
}

export const config: Config = {
  account: "738044534240",
  tableArn:
    "arn:aws:dynamodb:us-east-2:738044534240:table/puncher-prod-records",
  sourceRegion: "us-east-2",
  zoneId: "Z014656337LGZWAE9JKJP",
  zoneName: "7028robotics.com",
  domain: "stats.7028robotics.com",
  googleClientId:
    "574028865613-7leg6b1ae7mj6jmvf4ssspl273u6ek8t.apps.googleusercontent.com",
  googleClientSecretParameter: "/stats/google-client-secret",
  allowedDomain: "stmarobotics.org",
  puncherUrl: "https://puncher.7028robotics.com",
  repository: "STMARobotics@32277731/Stats@1443490446",
  providerArn:
    "arn:aws:iam::738044534240:oidc-provider/token.actions.githubusercontent.com",
};
