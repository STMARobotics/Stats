import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  type Activity,
  type Metrics,
  digest,
  metricNames,
  parseActivity,
  parseActivityWire,
  zeroMetrics,
} from './activity-contract';

export type ProjectionRow = {
  pk: string;
  sk: string;
  revision: number;
  contribution?: Activity;
  fingerprint?: string;
  metrics?: Metrics;
  lastProcessedAt?: string;
};
export type ProjectionWrite = { beforeRevision: number | undefined; row: ProjectionRow };
export class ProjectionConflict extends Error {}
export interface ProjectionStore {
  get(pk: string, sk: string): Promise<ProjectionRow | undefined>;
  commit(writes: ProjectionWrite[]): Promise<void>;
}
export class DynamoProjectionStore implements ProjectionStore {
  constructor(
    private table: string,
    private client = DynamoDBDocumentClient.from(new DynamoDBClient({})),
  ) {}
  async get(pk: string, sk: string) {
    return (
      await this.client.send(
        new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }),
      )
    ).Item as ProjectionRow | undefined;
  }
  async commit(writes: ProjectionWrite[]) {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: writes.map((w) => ({
            Put: {
              TableName: this.table,
              Item: w.row,
              ...(w.beforeRevision === undefined
                ? { ConditionExpression: 'attribute_not_exists(pk)' }
                : {
                    ConditionExpression: '#r = :r',
                    ExpressionAttributeNames: { '#r': 'revision' },
                    ExpressionAttributeValues: { ':r': w.beforeRevision },
                  }),
            },
          })),
        }),
      );
    } catch (error) {
      const e = error as { name?: string; CancellationReasons?: { Code?: string }[] };
      if (
        e.name === 'TransactionConflictException' ||
        (e.name === 'TransactionCanceledException' &&
          e.CancellationReasons?.some(
            (r) => r.Code === 'ConditionalCheckFailed' || r.Code === 'TransactionConflict',
          ))
      )
        throw new ProjectionConflict();
      throw error;
    }
  }
}
const fingerprint = (e: Activity) =>
  digest([e.eventId, e.occurredAt, e.effectiveDate, ...metricNames.map((k) => e.metrics[k])]);
const scopes = (date: string) => [
  'career',
  'year:' + (Number(date.slice(0, 4)) + (date.slice(5) > '06-01' ? 1 : 0)),
  'day:' + date,
];
export async function projectActivity(
  store: ProjectionStore,
  value: unknown,
  generation: string,
  now = () => new Date().toISOString(),
): Promise<'applied' | 'duplicate' | 'stale'> {
  const e = parseActivity(value);
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(generation)) throw new Error('Invalid projection generation.');
  const prefix = 'GEN#' + generation + '#ORG#' + e.orgId;
  const subjectKey = 'SUBJECT#' + digest([e.subject.namespace, e.subject.id]);
  const contributionPk = prefix + '#ACTIVITY#' + digest([e.source, e.entityId]);
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await store.get(contributionPk, subjectKey);
    if (previous?.contribution && previous.contribution.entityVersion > e.entityVersion)
      return 'stale';
    if (previous?.contribution?.entityVersion === e.entityVersion) {
      if (previous.fingerprint !== fingerprint(e))
        throw new Error('Conflicting snapshots for the same activity revision.');
      return 'duplicate';
    }
    // Revisions are full snapshots, so gaps and reverse delivery need no buffering.
    const deltas = new Map<string, Metrics>();
    const add = (date: string, metrics: Metrics, sign: number) => {
      for (const scope of scopes(date)) {
        const delta = deltas.get(scope) ?? zeroMetrics();
        for (const metric of metricNames) delta[metric] += sign * metrics[metric];
        deltas.set(scope, delta);
      }
    };
    if (previous?.contribution)
      add(previous.contribution.effectiveDate, previous.contribution.metrics, -1);
    add(e.effectiveDate, e.metrics, 1);
    const processedAt = now();
    const writes: ProjectionWrite[] = [
      {
        beforeRevision: previous?.revision,
        row: {
          pk: contributionPk,
          sk: subjectKey,
          revision: (previous?.revision ?? 0) + 1,
          contribution: e,
          fingerprint: fingerprint(e),
          lastProcessedAt: processedAt,
        },
      },
    ];
    for (const [scope, delta] of deltas) {
      const pk = prefix + '#TOTAL#' + scope;
      const current = await store.get(pk, subjectKey);
      const metrics = { ...(current?.metrics ?? zeroMetrics()) };
      for (const metric of metricNames) {
        metrics[metric] += delta[metric];
        if (!Number.isSafeInteger(metrics[metric]) || metrics[metric] < 0)
          throw new Error('Projection total is invalid; reconciliation required.');
      }
      writes.push({
        beforeRevision: current?.revision,
        row: {
          pk,
          sk: subjectKey,
          revision: (current?.revision ?? 0) + 1,
          metrics,
          lastProcessedAt: processedAt,
        },
      });
    }
    try {
      await store.commit(writes);
      return 'applied';
    } catch (error) {
      if (!(error instanceof ProjectionConflict)) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(5 * 2 ** attempt, 100)));
    }
  }
  throw new Error('Projection contention; retry the message.');
}

export type ActivityBatch = { Records: { messageId: string; body: string }[] };
export async function consumeActivityBatch(
  batch: ActivityBatch,
  store: ProjectionStore,
  settings: { orgId: string; account: string; region: string; generation: string },
) {
  const failures: { itemIdentifier: string }[] = [];
  for (const record of batch.Records) {
    try {
      const envelope = JSON.parse(record.body);
      const event = parseActivityWire(envelope.detail);
      if (
        envelope.account !== settings.account ||
        envelope.region !== settings.region ||
        envelope.source !== 'org.apps.' + event.source ||
        envelope['detail-type'] !== event.type ||
        event.orgId !== settings.orgId
      )
        throw new Error('Event transport ownership mismatch.');
      await projectActivity(store, event, settings.generation);
    } catch {
      // Do not log message bodies, subject IDs, or source records.
      console.error(
        JSON.stringify({ event: 'activity_projection_failed', messageId: record.messageId }),
      );
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
export async function handler(batch: ActivityBatch) {
  const table = process.env.ACTIVITY_TABLE_NAME,
    orgId = process.env.INTEGRATION_ORG_ID,
    account = process.env.INTEGRATION_ACCOUNT,
    region = process.env.AWS_REGION,
    generation = process.env.ACTIVITY_PROJECTION_GENERATION;
  if (!table || !orgId || !account || !region || !generation)
    throw new Error('Explicit activity consumer configuration is required.');
  return consumeActivityBatch(batch, new DynamoProjectionStore(table), {
    orgId,
    account,
    region,
    generation,
  });
}
