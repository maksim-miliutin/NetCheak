import type { Database } from './database.ts';
import type { TargetResult } from '../probe/probe.ts';
import type { SpeedResult } from '../speed/speed.ts';

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

export interface SpeedRow
{
    measuredAt: string;
    source: string;
    downloadMbps: number | null;
    uploadMbps: number | null;
    streams: number;
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
    checkedAt: string | null;
    samples: SamplePoint[];
}

// SQLite has no boolean and no json type, so rows arrive shaped differently from
// what the API promises: flags as 1 and 0, the sample list as text.
interface TargetRecord extends Omit<TargetRow, 'enabled'>
{
    enabled: number;
}

interface StatusRecord extends Omit<StatusRow, 'samples'>
{
    samples: string | null;
}

const LATEST_STATUS = `
    WITH ranked AS (
        SELECT
            r.id, r.target_id, r.loss_percent, r.average_ms, r.jitter_ms, r.quality,
            c.started_at,
            ROW_NUMBER() OVER (
                PARTITION BY r.target_id ORDER BY c.started_at DESC, r.id DESC
            ) AS place
        FROM target_runs r
        JOIN checks c ON c.id = r.check_id
    )
    SELECT
        t.id AS targetId, t.name, t.host, t.port,
        l.loss_percent AS lossPercent,
        l.average_ms AS averageMs,
        l.jitter_ms AS jitterMs,
        l.quality,
        l.started_at AS checkedAt,
        (
            SELECT json_group_array(json_object(
                'reachable', s.reachable,
                'latencyMs', s.latency_ms
            ))
            FROM (
                SELECT reachable, latency_ms FROM samples
                WHERE target_run_id = l.id ORDER BY id
            ) s
        ) AS samples
    FROM targets t
    LEFT JOIN ranked l ON l.target_id = t.id AND l.place = 1
    WHERE t.enabled = 1
    ORDER BY t.id
`;

export class ChecksRepository
{
    private readonly db: Database;

    constructor(db: Database)
    {
        this.db = db;
    }

    listTargets(): TargetRow[]
    {
        const rows = this.db
            .prepare('SELECT id, name, host, port, enabled FROM targets ORDER BY id')
            .all() as unknown as TargetRecord[];

        return rows.map((row) => ({ ...row, enabled: row.enabled === 1 }));
    }

    createCheck(attempts: number, timeoutMs: number): number
    {
        const row = this.db
            .prepare('INSERT INTO checks (attempts, timeout_ms) VALUES (?, ?) RETURNING id')
            .get(attempts, timeoutMs) as { id: number } | undefined;

        if (row === undefined)
        {
            throw new Error('checks insert returned no id');
        }

        return row.id;
    }

    saveResult(checkId: number, targetId: number, result: TargetResult): number
    {
        const s = result.statistics;

        // Both writes or neither. A run saved without its samples draws an empty
        // chart, which reads as a quiet network rather than as lost data.
        this.db.exec('BEGIN');

        try
        {
            const row = this.db.prepare(`
                INSERT INTO target_runs
                    (check_id, target_id, sent, received, loss_percent,
                     minimum_ms, average_ms, maximum_ms, median_ms, jitter_ms, quality)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            `).get(
                checkId, targetId, s.sent, s.received, s.lossPercent,
                s.minimumMs, s.averageMs, s.maximumMs, s.medianMs, s.jitterMs, s.quality,
            ) as { id: number } | undefined;

            if (row === undefined)
            {
                throw new Error('target_runs insert returned no id');
            }

            this.insertSamples(row.id, result);
            this.db.exec('COMMIT');

            return row.id;
        }
        catch (err)
        {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }

    /** Newest run per target, keeping targets that were never checked. */
    latestStatus(): StatusRow[]
    {
        // Individual samples travel with the summary: five steady replies and four
        // fast ones plus a timeout average out the same but mean different things.
        const rows = this.db.prepare(LATEST_STATUS).all() as unknown as StatusRecord[];

        return rows.map((row) => ({ ...row, samples: parseSamples(row.samples) }));
    }

    saveSpeed(result: SpeedResult): void
    {
        this.db.prepare(`
            INSERT INTO speed_runs
                (source, download_mbps, upload_mbps, download_bytes, upload_bytes, streams)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            result.source,
            result.download?.megabits ?? null,
            result.upload?.megabits ?? null,
            result.download?.bytes ?? null,
            result.upload?.bytes ?? null,
            result.download?.streams ?? result.upload?.streams ?? 0,
        );
    }

    latestSpeed(): SpeedRow | null
    {
        const row = this.db.prepare(`
            SELECT
                measured_at AS measuredAt, source,
                download_mbps AS downloadMbps,
                upload_mbps AS uploadMbps,
                streams
            FROM speed_runs
            ORDER BY measured_at DESC, id DESC
            LIMIT 1
        `).get() as SpeedRow | undefined;

        return row ?? null;
    }

    private insertSamples(runId: number, result: TargetResult): void
    {
        if (result.samples.length === 0)
        {
            return;
        }

        // One statement with a row per sample instead of a loop: five round trips
        // per target add up once there are ten targets.
        const placeholders = result.samples.map(() => '(?, ?, ?, ?)').join(', ');
        const values = result.samples
            .flatMap((v) => [runId, v.reachable ? 1 : 0, v.latencyMs, v.error]);

        const sql = `INSERT INTO samples (target_run_id, reachable, latency_ms, error)
            VALUES ${placeholders}`;

        this.db.prepare(sql).run(...values as never[]);
    }
}

/** json_group_array hands back text, and reachable sits inside it as 1 or 0. */
function parseSamples(value: string | null): SamplePoint[]
{
    if (value === null)
    {
        return [];
    }

    const parsed = JSON.parse(value) as { reachable: number; latencyMs: number | null }[];

    return parsed.map((v) => ({ reachable: v.reachable === 1, latencyMs: v.latencyMs }));
}
