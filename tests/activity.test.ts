import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import {
  makeActivity,
  parseActivity,
  parseActivityWire,
  toActivityWire,
  digest,
  type Activity,
} from '../service/activity-contract';
import {
  projectActivity,
  consumeActivityBatch,
  ProjectionConflict,
  type ProjectionStore,
  type ProjectionRow,
  type ProjectionWrite,
} from '../service/activity-projection';
const fixtures: Activity[] = JSON.parse(
  readFileSync('contracts/fixtures/activity-v1.json', 'utf8'),
);
class MemoryProjection implements ProjectionStore {
  rows = new Map<string, ProjectionRow>();
  async get(pk: string, sk: string) {
    return structuredClone(this.rows.get(pk + '|' + sk));
  }
  async commit(writes: ProjectionWrite[]) {
    for (const w of writes)
      if (this.rows.get(w.row.pk + '|' + w.row.sk)?.revision !== w.beforeRevision)
        throw new ProjectionConflict();
    for (const w of writes) this.rows.set(w.row.pk + '|' + w.row.sk, structuredClone(w.row));
  }
  total(scope = 'career', generation = 'shadow-v1', subject = fixtures[0].subject) {
    return this.rows.get(
      'GEN#' +
        generation +
        '#ORG#example-team#TOTAL#' +
        scope +
        '|SUBJECT#' +
        digest([subject.namespace, subject.id]),
    )?.metrics;
  }
}
const revise = (
  e: Activity,
  version: number,
  metrics: Partial<Activity['metrics']>,
  effectiveDate = e.effectiveDate,
) =>
  makeActivity({
    ...e,
    entityVersion: version,
    effectiveDate,
    metrics: { ...e.metrics, ...metrics },
  });
describe('activity shadow projection', () => {
  it('decodes the explicit string-valued stream transport before validating domain snapshots', () => {
    const wires = JSON.parse(readFileSync('contracts/fixtures/activity-wire-v1.json', 'utf8'));
    const validate = new Ajv().compile(
      JSON.parse(readFileSync('contracts/activity-wire.v1.json', 'utf8')),
    );
    for (let i = 0; i < fixtures.length; i++) {
      expect(toActivityWire(fixtures[i])).toEqual(wires[i]);
      expect(validate(wires[i]), JSON.stringify(validate.errors)).toBe(true);
      expect(parseActivityWire(wires[i])).toEqual(fixtures[i]);
    }
    const malformed = structuredClone(wires[0]);
    malformed.activity.metrics.shopSeconds = '1.5';
    expect(() => parseActivityWire(malformed)).toThrow();
    malformed.activity.metrics.shopSeconds = '9007199254740992';
    expect(() => parseActivityWire(malformed)).toThrow();
    malformed.activity.metrics.shopSeconds = 3600;
    expect(() => parseActivityWire(malformed)).toThrow();
    expect(() => parseActivityWire({ ...wires[0], orgId: 'another-team' })).toThrow();
    expect(() => parseActivityWire(fixtures[0])).toThrow();
  });
  it('accepts every language-neutral fixture and enforces source ownership, units, dates, and shape', () => {
    const validate = new Ajv().compile(
      JSON.parse(readFileSync('contracts/activity-snapshot.v1.json', 'utf8')),
    );
    for (const f of fixtures) {
      expect(validate(f), JSON.stringify(validate.errors)).toBe(true);
      expect(parseActivity(f)).toEqual(f);
    }
    for (const invalid of [
      { ...fixtures[0], schemaVersion: 2 },
      { ...fixtures[0], orgId: 123 },
      { ...fixtures[0], metrics: { ...fixtures[0].metrics, shopSeconds: 1.5 } },
      { ...fixtures[0], effectiveDate: '2026-02-30' },
      { ...fixtures[0], actorEmail: 'private@example.org' },
      { ...fixtures[0], source: 'packs' },
    ])
      expect(() => parseActivity(invalid)).toThrow();
  });
  it('applies an activity once under duplicate and concurrent deliveries', async () => {
    const db = new MemoryProjection();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => projectActivity(db, fixtures[0], 'shadow-v1')),
    );
    expect(results.filter((x) => x === 'applied')).toHaveLength(1);
    expect(db.total()?.shopSeconds).toBe(3600);
  });
  it('ignores old revisions after a void and rejects conflicting payloads for an accepted revision', async () => {
    const db = new MemoryProjection();
    const first = fixtures[0],
      voided = revise(first, 3, { shopSeconds: 0 });
    await projectActivity(db, voided, 'shadow-v1');
    expect(await projectActivity(db, first, 'shadow-v1')).toBe('stale');
    expect(db.total()?.shopSeconds).toBe(0);
    await expect(
      projectActivity(db, revise(voided, 3, { shopSeconds: 99 }), 'shadow-v1'),
    ).rejects.toThrow('Conflicting');
  });
  it('moves corrections across dates and reporting years without changing career credit', async () => {
    const db = new MemoryProjection();
    const first = revise(fixtures[0], 1, {}, '2026-06-01');
    await projectActivity(db, first, 'shadow-v1');
    await projectActivity(db, revise(first, 2, {}, '2026-06-02'), 'shadow-v1');
    expect(db.total('year:2026')?.shopSeconds).toBe(0);
    expect(db.total('year:2027')?.shopSeconds).toBe(3600);
    expect(db.total()?.shopSeconds).toBe(3600);
  });
  it('converges on exact totals when distinct source activities race', async () => {
    const db = new MemoryProjection();
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        projectActivity(db, makeActivity({ ...fixtures[0], entityId: 'visit:' + i }), 'shadow-v1'),
      ),
    );
    expect(db.total()?.shopSeconds).toBe(21600);
  });
  it('isolates rebuild generations and native subjects instead of guessing account links', async () => {
    const db = new MemoryProjection();
    for (const event of fixtures) await projectActivity(db, event, 'shadow-v1');
    await projectActivity(db, fixtures[0], 'rebuild-v2');
    expect(db.total()?.shopSeconds).toBe(3600);
    expect(db.total('career', 'rebuild-v2')?.shopSeconds).toBe(3600);
    expect(db.total('career', 'shadow-v1', fixtures[1].subject)?.packsOpened).toBe(1);
    expect(db.total()?.packsOpened).toBe(0);
  });
  it('returns only failed SQS messages and rejects the wrong transport account', async () => {
    const db = new MemoryProjection();
    const envelope = {
      account: '111111111111',
      region: 'us-east-2',
      source: 'org.apps.puncher',
      'detail-type': fixtures[0].type,
      detail: toActivityWire(fixtures[0]),
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await consumeActivityBatch(
        {
          Records: [
            { messageId: 'ok', body: JSON.stringify(envelope) },
            { messageId: 'bad', body: 'invalid json' },
            {
              messageId: 'foreign',
              body: JSON.stringify({ ...envelope, account: '222222222222' }),
            },
          ],
        },
        db,
        {
          orgId: 'example-team',
          account: '111111111111',
          region: 'us-east-2',
          generation: 'shadow-v1',
        },
      );
      expect(result).toEqual({
        batchItemFailures: [{ itemIdentifier: 'bad' }, { itemIdentifier: 'foreign' }],
      });
      expect(db.total()?.shopSeconds).toBe(3600);
      expect(JSON.stringify(log.mock.calls)).not.toContain('member-a');
    } finally {
      log.mockRestore();
    }
  });
});
