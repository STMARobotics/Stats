import { CfnOutput, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { type Props, zone } from "./stack-common";
export class CertificateStack extends Stack {
  readonly certificate: acm.ICertificate;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.config.domain,
      validation: acm.CertificateValidation.fromDns(zone(this, props.config)),
    });
    new CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
    });
  }
}
