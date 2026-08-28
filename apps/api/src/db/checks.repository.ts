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

export interface Run
{
    checkedAt: string;
    lossPercent: number;
    averageMs: number | null;
}

export interface Swept
{
    samples: number;
    checks: number;
}

export interface History
{
    targetId: number;
    name: string;
    runs: Run[];
    lossyRuns: number;
}

interface HistoryRecord extends Run
{
    targetId: number;
    name: string;
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

// Numbering every run to keep the first of each made SQLite build the whole table
// before answering: at a year of checking that is four hundred thousand rows for four
// answers. Asking each target for its own newest run walks the index instead. Run ids
// rise with time, so ordering by id is ordering by clock.
const LATEST_STATUS = `
    SELECT
        t.id AS targetId, t.name, t.host, t.port,
        r.loss_percent AS lossPercent,
        r.average_ms AS averageMs,
        r.jitter_ms AS jitterMs,
        r.quality,
        c.started_at AS checkedAt,
        (
            SELECT json_group_array(json_object(
                'reachable', s.reachable,
                'latencyMs', s.latency_ms
            ))
            FROM (
                SELECT reachable, latency_ms FROM samples
                WHERE target_run_id = r.id ORDER BY id
            ) s
        ) AS samples
    FROM targets t
    LEFT JOIN target_runs r ON r.id = (
        SELECT id FROM target_runs WHERE target_id = t.id ORDER BY id DESC LIMIT 1
    )
    LEFT JOIN checks c ON c.id = r.check_id
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

    /** Adds a target, or returns the one already watching that host and port. */
    addTarget(name: string, host: string, port: number): TargetRow
    {
        this.db.prepare(`
            INSERT INTO targets (name, host, port) VALUES (?, ?, ?)
            ON CONFLICT (host, port) DO UPDATE SET enabled = 1
        `).run(name, host, port);

        const found = `SELECT id, name, host, port, enabled
            FROM targets WHERE host = ? AND port = ?`;
        const row = this.db.prepare(found).get(host, port) as TargetRecord | undefined;

        if (row === undefined)
        {
            throw new Error('target insert returned nothing');
        }

        return { ...row, enabled: row.enabled === 1 };
    }

    /**
     * Rows are kept rather than deleted: their runs are the history of a line, and a
     * target removed today should not erase what it measured last week.
     */
    removeTarget(id: number): boolean
    {
        const changed = this.db.prepare('UPDATE targets SET enabled = 0 WHERE id = ?').run(id);

        return changed.changes > 0;
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

    /**
     * Individual attempts are read for the newest run of each target and never again,
     * yet they are two thirds of the file. The summaries are what the history draws,
     * so they outlive the attempts they were drawn from by a long way.
     */
    prune(sampleDays = 7, runDays = 365): Swept
    {
        const samples = this.db.prepare(`
            DELETE FROM samples WHERE target_run_id IN (
                SELECT r.id FROM target_runs r
                JOIN checks c ON c.id = r.check_id
                WHERE c.started_at < datetime('now', ?)
            )
        `).run(`-${sampleDays} days`);

        // Runs go with their check, and their samples go with them: the cascade does it.
        const checks = this.db
            .prepare("DELETE FROM checks WHERE started_at < datetime('now', ?)")
            .run(`-${runDays} days`);

        return { samples: Number(samples.changes), checks: Number(checks.changes) };
    }

    /**
     * Recent runs for every watched target, newest last. A line that drops for a
     * minute every evening looks perfect in the latest check and obvious here.
     */
    history(limit = 20): History[]
    {
        // Same reasoning as the status query: each target asks for its own newest
        // runs down the index rather than numbering every row in the table.
        const rows = this.db.prepare(`
            SELECT
                t.id AS targetId, t.name,
                c.started_at AS checkedAt,
                r.loss_percent AS lossPercent,
                r.average_ms AS averageMs
            FROM targets t
            JOIN target_runs r ON r.id IN (
                SELECT id FROM target_runs WHERE target_id = t.id ORDER BY id DESC LIMIT ?
            )
            JOIN checks c ON c.id = r.check_id
            WHERE t.enabled = 1
            ORDER BY t.id, r.id
        `).all(limit) as unknown as HistoryRecord[];

        const byTarget = new Map<number, History>();

        for (const row of rows)
        {
            const found = byTarget.get(row.targetId)
                ?? { targetId: row.targetId, name: row.name, runs: [], lossyRuns: 0 };

            found.runs.push({
                checkedAt: row.checkedAt,
                lossPercent: row.lossPercent,
                averageMs: row.averageMs,
            });

            if (row.lossPercent > 0)
            {
                found.lossyRuns += 1;
            }

            byTarget.set(row.targetId, found);
        }

        return [...byTarget.values()];
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
