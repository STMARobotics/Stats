export type Config = {
  environment: string;
  account: string;
  tableArn: string;
  tableName: string;
  sourceRegion: string;
  zoneId: string;
  zoneName: string;
  domain: string;
  googleClientId: string;
  alertEmail?: string;
  puncherUrl?: string;
  certificateArn?: string;
};
export function configuration(validation: boolean): Config {
  if (validation)
    return {
      environment: "validation",
      account: "111111111111",
      tableArn:
        "arn:aws:dynamodb:us-east-2:111111111111:table/puncher-development",
      tableName: "puncher-development",
      sourceRegion: "us-east-2",
      zoneId: "ZVALIDATION",
      zoneName: "7028robotics.com",
      domain: "stats.7028robotics.com",
      googleClientId: "validation-only.apps.googleusercontent.com",
      certificateArn:
        "arn:aws:acm:us-east-1:111111111111:certificate/11111111-1111-4111-8111-111111111111",
    };
  const required = (key: string) => {
    const value = process.env[key];
    if (!value || value.includes("REPLACE"))
      throw new Error(`Set ${key} explicitly before deployment.`);
    return value;
  };
  const config: Config = {
    environment: required("STATS_ENV"),
    account: required("STATS_ACCOUNT"),
    tableArn: required("PUNCHER_TABLE_ARN"),
    tableName: required("TABLE_NAME"),
    sourceRegion: required("SOURCE_REGION"),
    zoneId: required("HOSTED_ZONE_ID"),
    zoneName: required("HOSTED_ZONE_NAME"),
    domain: required("STATS_DOMAIN"),
    googleClientId: required("GOOGLE_CLIENT_ID"),
    alertEmail: process.env.ALERT_EMAIL,
  };
  if (
    !["development", "staging", "production"].includes(config.environment) ||
    !/^\d{12}$/.test(config.account) ||
    !config.googleClientId.endsWith(".apps.googleusercontent.com")
  )
    throw new Error("Invalid deployment environment/account/OAuth client.");
  if (
    config.tableArn !==
    `arn:aws:dynamodb:${config.sourceRegion}:${config.account}:table/${config.tableName}`
  )
    throw new Error(
      "Table ARN/name/region/account must agree. Cross-account integration requires an explicit coordinated policy.",
    );
  if (!config.domain.endsWith("." + config.zoneName))
    throw new Error("Stats domain must belong to the configured hosted zone.");
  if (process.env.PUNCHER_URL) {
    if (!process.env.PUNCHER_URL.startsWith("https://"))
      throw new Error("PUNCHER_URL must use HTTPS.");
    config.puncherUrl = process.env.PUNCHER_URL;
  }
  if (process.env.STATS_CERTIFICATE_ARN) {
    if (
      !process.env.STATS_CERTIFICATE_ARN.startsWith(
        `arn:aws:acm:us-east-1:${config.account}:certificate/`,
      )
    )
      throw new Error(
        "Stats certificate must be in the configured account and us-east-1.",
      );
    config.certificateArn = process.env.STATS_CERTIFICATE_ARN;
  }
  return config;
}
