import type { Database } from './database';
import type { TargetResult } from '../probe/probe';

export interface TargetRow
{
    id: number;
    name: string;
    host: string;
    port: number;
    enabled: boolean;
}
export interface SamplePoint
{
    reachable: boolean;
    latencyMs: number | null;
}
export interface StatusRow
{
    targetId: number;
    name: string;
    host: string;
    port: number;
    lossPercent: number | null;
    averageMs: number | null;
    jitterMs: number | null;
    quality: string | null;
    checkedAt: Date | null;
    samples: SamplePoint[];
}

export class ChecksRepository
{
    constructor(private readonly db: Database) {}

    async listTargets(): Promise<TargetRow[]>
    {
        const { rows } = await this.db.query<TargetRow>('SELECT id, name, host, port, enabled FROM targets ORDER BY id');

        return rows;
    }

    async createCheck(attempts: number, timeoutMs: number): Promise<number>
    {
        const { rows } = await this.db.query<{ id: number }>(
            'INSERT INTO checks (attempts, timeout_ms) VALUES ($1, $2) RETURNING id',
            [attempts, timeoutMs],
        );

        return rows[0].id;
    }

    async saveResult(checkId: number, targetId: number, result: TargetResult): Promise<number>
    {
        const s = result.statistics;

        const { rows } = await this.db.query<{ id: number }>(`
            INSERT INTO target_runs
                (check_id, target_id, sent, received, loss_percent,
                 minimum_ms, average_ms, maximum_ms, median_ms, jitter_ms, quality)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `,
        [
            checkId, targetId, s.sent, s.received, s.lossPercent,
            s.minimumMs, s.averageMs, s.maximumMs, s.medianMs, s.jitterMs, s.quality,
        ]);

        const runId = rows[0].id;

        if (result.samples.length === 0)
        {
            return runId;
        }

        // One statement with unnest instead of a loop: five round trips per target
        // add up once there are ten targets.
        await this.db.query(`
            INSERT INTO samples (target_run_id, reachable, latency_ms, error)
            SELECT $1, * FROM unnest($2::boolean[], $3::double precision[], $4::text[])
        `,
        [
            runId,
            result.samples.map((v) => v.reachable),
            result.samples.map((v) => v.latencyMs),
            result.samples.map((v) => v.error),
        ]);

        return runId;
    }

    /** Newest run per target, keeping targets that were never checked. */
     /** Newest run per target, keeping targets that were never checked. */
    async latestStatus(): Promise<StatusRow[]>
    {
        // Individual samples travel with the summary: five steady replies and four
        // fast ones plus a timeout average out the same but mean different things.
        const { rows } = await this.db.query<StatusRow>(`
            SELECT DISTINCT ON (t.id)
                t.id AS "targetId", t.name, t.host, t.port,
                r.loss_percent AS "lossPercent",
                r.average_ms AS "averageMs",
                r.jitter_ms AS "jitterMs",
                r.quality,
                c.started_at AS "checkedAt",
                COALESCE((
                    SELECT json_agg(json_build_object('reachable', s.reachable, 'latencyMs', s.latency_ms) ORDER BY s.id)
                    FROM samples s
                    WHERE s.target_run_id = r.id
                ), '[]'::json) AS samples
            FROM targets t
            LEFT JOIN target_runs r ON r.target_id = t.id
            LEFT JOIN checks c ON c.id = r.check_id
            WHERE t.enabled
            ORDER BY t.id, c.started_at DESC NULLS LAST
        `);

        return rows;
    }
}