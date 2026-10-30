import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
const availabilitySchema = z.object({
  startDatetime: z.string().datetime({ offset: true }),
  endDatetime: z.string().datetime({ offset: true }),
  available: z.boolean(),
  reason: z.string().trim().max(500).optional(),
}).refine((entry) => new Date(entry.endDatetime) > new Date(entry.startDatetime), {
  path: ['endDatetime'], message: 'End time must be after start time.',
});

export async function POST(request: NextRequest, context: { params: { resourceId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'VENDOR'].includes(user.role_name)) return forbiddenResponse();
  const resourceId = Number(context.params.resourceId);
  if (!Number.isSafeInteger(resourceId) || resourceId < 1) return NextResponse.json({ error: 'Invalid resource ID.' }, { status: 400 });
  const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid availability period.', details: parsed.error.flatten() }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resource = await client.query(
      `SELECT resource_id FROM resources WHERE resource_id = $1
       AND ($2::text = 'ADMIN' OR owner_id = $3) FOR UPDATE`,
      [resourceId, user.role_name, user.user_id],
    );
    if (!resource.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Resource not found or you do not own it.' }, { status: 404 });
    }
    if (!parsed.data.available) {
      const result = await client.query(
        `INSERT INTO resource_availability(resource_id, start_datetime, end_datetime, availability_status, reason)
         VALUES($1, $2, $3, 'UNAVAILABLE', $4) RETURNING *`,
        [resourceId, parsed.data.startDatetime, parsed.data.endDatetime, parsed.data.reason ?? null],
      );
      await client.query('COMMIT');
      return NextResponse.json({ data: result.rows[0] }, { status: 201 });
    }
    const blocked = await client.query(
      `SELECT availability_id, start_datetime, end_datetime, reason FROM resource_availability
       WHERE resource_id = $1 AND availability_status = 'UNAVAILABLE'
         AND tstzrange(start_datetime, end_datetime, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       FOR UPDATE`,
      [resourceId, parsed.data.startDatetime, parsed.data.endDatetime],
    );
    for (const period of blocked.rows) {
      await client.query('DELETE FROM resource_availability WHERE availability_id = $1', [period.availability_id]);
      if (new Date(period.start_datetime) < new Date(parsed.data.startDatetime)) {
        await client.query(
          `INSERT INTO resource_availability(resource_id, start_datetime, end_datetime, availability_status, reason)
           VALUES($1, $2, $3, 'UNAVAILABLE', $4)`,
          [resourceId, period.start_datetime, parsed.data.startDatetime, period.reason],
        );
      }
      if (new Date(period.end_datetime) > new Date(parsed.data.endDatetime)) {
        await client.query(
          `INSERT INTO resource_availability(resource_id, start_datetime, end_datetime, availability_status, reason)
           VALUES($1, $2, $3, 'UNAVAILABLE', $4)`,
          [resourceId, parsed.data.endDatetime, period.end_datetime, period.reason],
        );
      }
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: { available: true, clearedPeriods: blocked.rowCount ?? 0 } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/resources/[resourceId]/availability', error);
    return NextResponse.json({ error: 'Could not update resource availability.' }, { status: 500 });
  } finally {
    client.release();
  }
}
