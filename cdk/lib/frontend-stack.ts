import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { resolve } from "node:path";
import type { Config } from "./config";
import { type Props, projectRoot, spaCode, zone } from "./stack-common";
export class FrontendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: Props & { api: apigw.IHttpApi; certificate: acm.ICertificate },
  ) {
    super(scope, id, props);
    const c = props.config;
    const bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const spa = new cf.Function(this, "SpaRouting", {
      runtime: cf.FunctionRuntime.JS_2_0,
      code: cf.FunctionCode.fromInline(spaCode),
    });
    const headers = new cf.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cf.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy:
            cf.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; img-src 'self' data: https://*.googleusercontent.com; font-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          override: true,
        },
      },
    });
    const apiOrigin = new origins.HttpOrigin(
      `${props.api.apiId}.execute-api.us-east-2.amazonaws.com`,
    );
    const frontendOrigin =
      origins.S3BucketOrigin.withOriginAccessControl(bucket);
    const apiBehavior: cf.AddBehaviorOptions = {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: headers,
    };
    const distribution = new cf.Distribution(this, "Distribution", {
      domainNames: [c.domain],
      certificate: props.certificate,
      defaultRootObject: "index.html",
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: frontendOrigin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        functionAssociations: [
          { eventType: cf.FunctionEventType.VIEWER_REQUEST, function: spa },
        ],
      },
      additionalBehaviors: {
        "/api/*": { origin: apiOrigin, ...apiBehavior },
        "/api": { origin: apiOrigin, ...apiBehavior },
        "/config.json": {
          origin: frontendOrigin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: headers,
        },
      },
    });
    new deploy.BucketDeployment(this, "PublishFrontend", {
      sources: [
        deploy.Source.asset(resolve(projectRoot, "dist/ui")),
        deploy.Source.jsonData("config.json", {
          googleClientId: c.googleClientId,
          allowedDomain: c.allowedDomain,
          demo: false,
          ...(c.puncherUrl ? { puncherUrl: c.puncherUrl } : {}),
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      cacheControl: [deploy.CacheControl.noCache()],
    });
    new route53.ARecord(this, "Alias", {
      zone: zone(this, c),
      recordName: c.domain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    new CfnOutput(this, "Url", { value: `https://${c.domain}` });
  }
}
