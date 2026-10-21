import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const scheduleSchema = z.object({
  activityName: z.string().trim().min(2).max(180),
  description: z.string().max(5000).nullable().optional(),
  startDatetime: z.string().datetime({ offset: true }),
  endDatetime: z.string().datetime({ offset: true }),
  location: z.string().max(500).nullable().optional(),
}).refine((item) => new Date(item.endDatetime) > new Date(item.startDatetime), {
  path: ['endDatetime'], message: 'End time must be after start time.',
});

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  try {
    const result = await pool.query(
      `SELECT * FROM event_schedules WHERE event_id = $1 ORDER BY start_datetime`,
      [eventId],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/events/[eventId]/schedules', error);
    return NextResponse.json({ error: 'Could not load event schedule.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  if (!(await canManageEvent(user, eventId))) return forbiddenResponse();
  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid schedule item.', details: parsed.error.flatten() }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query('SELECT start_datetime, end_datetime, status FROM events WHERE event_id = $1 FOR UPDATE', [eventId]);
    if (!event.rowCount || ['CANCELLED', 'COMPLETED'].includes(event.rows[0].status) ||
        new Date(parsed.data.startDatetime) < new Date(event.rows[0].start_datetime) ||
        new Date(parsed.data.endDatetime) > new Date(event.rows[0].end_datetime)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Schedule item must fit within an active event.' }, { status: 400 });
    }
    const result = await client.query(
      `INSERT INTO event_schedules(event_id, activity_name, description, start_datetime, end_datetime, location)
       VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [eventId, parsed.data.activityName, parsed.data.description ?? null, parsed.data.startDatetime, parsed.data.endDatetime, parsed.data.location ?? null],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/events/[eventId]/schedules', error);
    return NextResponse.json({ error: 'Could not create schedule item.' }, { status: 500 });
  } finally {
    client.release();
  }
}
