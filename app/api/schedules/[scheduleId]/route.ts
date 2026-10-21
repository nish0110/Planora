import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const updateSchema = z.object({
  activityName: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(5000).nullable().optional(),
  startDatetime: z.string().datetime({ offset: true }).optional(),
  endDatetime: z.string().datetime({ offset: true }).optional(),
  location: z.string().max(500).nullable().optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

async function authorizeSchedule(request: NextRequest, scheduleId: number) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, response: unauthorizedResponse(), eventId: null };
  const record = await pool.query('SELECT event_id FROM event_schedules WHERE schedule_id = $1', [scheduleId]);
  if (!record.rowCount) return { user, response: NextResponse.json({ error: 'Schedule item not found.' }, { status: 404 }), eventId: null };
  const eventId = Number(record.rows[0].event_id);
  if (!(await canManageEvent(user, eventId))) return { user, response: forbiddenResponse(), eventId };
  return { user, response: null, eventId };
}

export async function PATCH(request: NextRequest, context: { params: { scheduleId: string } }) {
  const id = Number(context.params.scheduleId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid schedule ID.' }, { status: 400 });
  const access = await authorizeSchedule(request, id);
  if (access.response) return access.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return NextResponse.json({ error: 'Provide valid schedule updates.' }, { status: 400 });
  const d = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT event_id FROM events WHERE event_id = $1 FOR UPDATE', [access.eventId]);
    const result = await client.query(
      `UPDATE event_schedules AS s SET activity_name = COALESCE($2, s.activity_name),
         description = CASE WHEN $3::boolean THEN $4::text ELSE s.description END,
         start_datetime = COALESCE($5::timestamptz, s.start_datetime),
         end_datetime = COALESCE($6::timestamptz, s.end_datetime),
         location = CASE WHEN $7::boolean THEN $8::text ELSE s.location END,
         status = COALESCE($9, s.status)
       WHERE s.schedule_id = $1 AND s.event_id = $10
         AND COALESCE($5::timestamptz, s.start_datetime) < COALESCE($6::timestamptz, s.end_datetime)
         AND EXISTS (SELECT 1 FROM events e WHERE e.event_id = $10
           AND COALESCE($5::timestamptz, s.start_datetime) >= e.start_datetime
           AND COALESCE($6::timestamptz, s.end_datetime) <= e.end_datetime)
       RETURNING *`,
      [id, d.activityName ?? null, Object.hasOwn(d, 'description'), d.description ?? null,
        d.startDatetime ?? null, d.endDatetime ?? null, Object.hasOwn(d, 'location'), d.location ?? null, d.status ?? null, access.eventId],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Schedule update is invalid or outside event dates.' }, { status: 400 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/schedules/[scheduleId]', error);
    return NextResponse.json({ error: 'Could not update schedule item.' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, context: { params: { scheduleId: string } }) {
  const id = Number(context.params.scheduleId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid schedule ID.' }, { status: 400 });
  const access = await authorizeSchedule(request, id);
  if (access.response) return access.response;
  try {
    await pool.query('DELETE FROM event_schedules WHERE schedule_id = $1 AND event_id = $2', [id, access.eventId]);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error('DELETE /api/schedules/[scheduleId]', error);
    return NextResponse.json({ error: 'Could not delete schedule item.' }, { status: 500 });
  }
}
