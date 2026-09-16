// infra/lib/adlm-ops-alerts-stack.ts
//
// Puts AWS's own messages in front of a person.
//
// On 7 August 2026 AWS Support asked a question on our SES production access
// case. Nobody saw it, and on 17 August AWS closed the case for inactivity,
// which left the account in the SES sandbox for another month. In the same
// period the API's alarm topic had no subscribers at all, so every alarm it
// raised went nowhere. Both failures were silent for the same reason: AWS was
// talking, and nothing routed it to an inbox anyone reads.
//
// This stack is deliberately SEPARATE from AdlmApi. AdlmApi is shared across
// branches and a deploy from the wrong checkout deletes resources it does not
// know about (see infra/scripts/guarded-deploy.mjs). Alerting is exactly the
// thing that must not vanish in that kind of accident.
//
// Deployed twice:
//   * us-east-1 - AWS Support case updates are emitted here, and so are
//     account-wide AWS Health events (billing, account, global services).
//   * eu-west-1 - regional Health events for where the app runs (SES, Lambda),
//     plus a watchdog that alarms when the daily operations report stops.
//
// Every email subscription sends a confirmation link that MUST be clicked
// within three days, or AWS deletes it and alerts go nowhere again.

import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";

export interface AdlmOpsAlertsStackProps extends StackProps {
  /** Where every alert goes. One address, read daily. */
  alertEmail: string;
  /** Route AWS Support case updates. Only meaningful in us-east-1. */
  watchSupportCases: boolean;
  /**
   * The daily job's log group. When set, an alarm fires if the operations
   * report has not been sent for two consecutive days.
   */
  digestLogGroupName?: string;
}

export class AdlmOpsAlertsStack extends Stack {
  constructor(scope: Construct, id: string, props: AdlmOpsAlertsStackProps) {
    super(scope, id, props);

    const topic = new sns.Topic(this, "OpsAlerts", {
      displayName: "ADLM operations alerts",
    });
    topic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));

    // AWS Health: service issues, scheduled changes and account notices,
    // including the SES DKIM and MAIL FROM notices for our domain.
    new events.Rule(this, "HealthEvents", {
      description: "AWS Health events for this account and region, sent to the ops inbox",
      eventPattern: { source: ["aws.health"] },
      targets: [
        new eventTargets.SnsTopic(topic, {
          message: events.RuleTargetInput.fromMultilineText(
            [
              `AWS Health: ${events.EventField.fromPath("$.detail.eventTypeCode")}`,
              `Service: ${events.EventField.fromPath("$.detail.service")}`,
              `Category: ${events.EventField.fromPath("$.detail.eventTypeCategory")}`,
              `Region: ${events.EventField.fromPath("$.region")}`,
              "",
              "Details: https://health.aws.amazon.com/health/home#/account/dashboard/open-issues",
            ].join("\n"),
          ),
        }),
      ],
    });

    if (props.watchSupportCases) {
      // Every change on a support case: a reply from AWS, a case opened,
      // resolved or reopened. A reply from AWS is the one that must never sit
      // unread, because AWS closes a case after 14 days without an answer.
      new events.Rule(this, "SupportCaseUpdates", {
        description: "AWS Support case updates, sent to the ops inbox",
        eventPattern: { source: ["aws.support"], detailType: ["Support Case Update"] },
        targets: [
          new eventTargets.SnsTopic(topic, {
            message: events.RuleTargetInput.fromMultilineText(
              [
                `AWS Support case ${events.EventField.fromPath("$.detail.display-id")}: ${events.EventField.fromPath("$.detail.event-name")}`,
                `Written by: ${events.EventField.fromPath("$.detail.origin")}`,
                "",
                "If AWS wrote this, answer within a few days. AWS closes a case after 14 days without a reply.",
                `Open: https://support.console.aws.amazon.com/support/home#/case/?displayId=${events.EventField.fromPath("$.detail.display-id")}`,
              ].join("\n"),
            ),
          }),
        ],
      });
    }

    if (props.digestLogGroupName) {
      // The watchdog for the watchdog. The daily operations report logs
      // "[ops-digest] sent" when it goes out. If two whole days pass without
      // that line, the report itself has stopped, and silence would otherwise
      // look exactly like a quiet, healthy week.
      const logGroup = logs.LogGroup.fromLogGroupName(this, "DigestLogs", props.digestLogGroupName);
      const filter = new logs.MetricFilter(this, "DigestSentFilter", {
        logGroup,
        filterPattern: logs.FilterPattern.literal('"[ops-digest] sent"'),
        metricNamespace: "ADLM/Ops",
        metricName: "DailyReportSent",
        metricValue: "1",
      });

      const missing = new cloudwatch.Alarm(this, "DailyReportMissing", {
        alarmName: "adlm-daily-ops-report-missing",
        alarmDescription:
          "The daily ADLM operations report has not been sent for two days. The scheduled job may be failing.",
        metric: filter.metric({ statistic: "Sum", period: Duration.days(1) }),
        threshold: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      });
      missing.addAlarmAction(new actions.SnsAction(topic));
      missing.addOkAction(new actions.SnsAction(topic));
    }

    new CfnOutput(this, "OpsAlertsTopicArn", { value: topic.topicArn });
  }
}
