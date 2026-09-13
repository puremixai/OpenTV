const { randomUUID } = require('node:crypto');
const { getPostgresPool } = require('./postgres');

const metadata =
  'id, username, movie_key, movie_name, movie_year, requested_count, status, generation_id, result_revision, generated_at, error, updated_at';

function createAICommentsStore(pool = getPostgresPool()) {
  return {
    async get(username, key) {
      return (
        (
          await pool.query(
            `SELECT ${metadata} FROM ai_comment_jobs WHERE username=$1 AND movie_key=$2`,
            [username, key]
          )
        ).rows[0] || null
      );
    },
    async getResult(id, revision) {
      const row = (
        await pool.query(
          'SELECT comments FROM ai_comment_jobs WHERE id=$1 AND result_revision=$2',
          [id, revision]
        )
      ).rows[0];
      return row ? row.comments : null;
    },
    async enqueue(username, key, movie, regenerate = false) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize submissions by user, including two simultaneous first clicks.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          'ai-comments:' + username,
        ]);
        const existing = (
          await client.query(
            `SELECT ${metadata} FROM ai_comment_jobs WHERE username=$1 AND movie_key=$2 FOR UPDATE`,
            [username, key]
          )
        ).rows[0];
        if (
          existing &&
          (!regenerate || ['queued', 'running'].includes(existing.status))
        ) {
          await client.query('COMMIT');
          return existing;
        }
        const pending = (
          await client.query(
            "SELECT COUNT(*) AS n FROM ai_comment_jobs WHERE username=$1 AND status IN ('queued','running')",
            [username]
          )
        ).rows[0].n;
        if (Number(pending) >= 5) {
          const error = new Error(
            '最多同时保留 5 个待生成任务，请等待已有任务完成'
          );
          error.code = 'AI_QUEUE_FULL';
          throw error;
        }
        const now = Date.now();
        let row;
        if (existing) {
          row = (
            await client.query(
              `UPDATE ai_comment_jobs SET status='queued', generation_id=$2, movie_info=$3,
            lease_token=NULL, lease_until=NULL, attempts=0, error=NULL, updated_at=$4 WHERE id=$1 RETURNING ${metadata}`,
              [existing.id, randomUUID(), movie.info, now]
            )
          ).rows[0];
        } else {
          row = (
            await client.query(
              `INSERT INTO ai_comment_jobs
            (id,username,movie_key,movie_name,movie_year,movie_info,requested_count,status,generation_id,created_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,$9) RETURNING ${metadata}`,
              [
                randomUUID(),
                username,
                key,
                movie.name,
                movie.year,
                movie.info,
                movie.count,
                randomUUID(),
                now,
              ]
            )
          ).rows[0];
        }
        await client.query('COMMIT');
        return row;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async claim() {
      const now = Date.now();
      await pool.query(
        `UPDATE ai_comment_jobs SET status='failed', error='生成任务多次中断，请点击重试', lease_token=NULL, lease_until=NULL, updated_at=$1
        WHERE status='running' AND lease_until < $1 AND attempts >= 2`,
        [now]
      );
      return (
        (
          await pool.query(
            `WITH candidate AS (
        SELECT id FROM ai_comment_jobs WHERE attempts < 2 AND (status='queued' OR (status='running' AND lease_until < $1))
        ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE ai_comment_jobs j SET status='running', lease_token=$2, lease_until=$3,
        attempts=j.attempts+1, updated_at=$1 FROM candidate WHERE j.id=candidate.id RETURNING j.*`,
            [now, randomUUID(), now + 120000]
          )
        ).rows[0] || null
      );
    },
    async complete(id, leaseToken, comments, connection) {
      // A worker whose lease was recovered cannot overwrite a newer result.
      return (
        (
          await pool.query(
            `UPDATE ai_comment_jobs SET status='completed', comments=$3::jsonb,
        result_revision=result_revision+1, generated_at=$4, updated_at=$4, error=NULL,
        model=$5, protocol=$6, lease_token=NULL, lease_until=NULL
        WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING ${metadata}`,
            [
              id,
              leaseToken,
              JSON.stringify(comments),
              Date.now(),
              connection.model,
              connection.protocol,
            ]
          )
        ).rows[0] || null
      );
    },
    async fail(id, leaseToken, error) {
      await pool.query(
        `UPDATE ai_comment_jobs SET status='failed', error=$3, updated_at=$4, lease_token=NULL, lease_until=NULL
        WHERE id=$1 AND lease_token=$2 AND status='running'`,
        [id, leaseToken, error, Date.now()]
      );
    },
  };
}

module.exports = { createAICommentsStore };
