import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { updateEventSchema } from '@/lib/validation';

export const runtime = 'nodejs';

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = parseId(context.params.eventId);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  try {
    const result = await pool.query(
      `SELECT e.event_id, e.organizer_id, e.event_name, e.description, e.event_type, e.location,
              e.start_datetime, e.end_datetime, e.expected_attendees,
              CASE WHEN $2::text = 'ADMIN' OR e.organizer_id = $3 THEN e.total_budget ELSE NULL END AS total_budget,
              e.status, e.created_at, e.updated_at, u.full_name AS organizer_name
       FROM events e JOIN users u ON u.user_id = e.organizer_id WHERE e.event_id = $1`,
      [eventId, user.role_name, user.user_id],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('GET /api/events/[eventId]', error);
    return NextResponse.json({ error: 'Could not load event details.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const eventId = parseId(context.params.eventId);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  if (!(await canManageEvent(user, eventId))) return forbiddenResponse();
  const parsed = updateEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event updates.', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT start_datetime, end_datetime, status FROM events WHERE event_id = $1 FOR UPDATE',
      [eventId],
    );
    if (!current.rowCount || current.rows[0].status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found or cancelled.' }, { status: 404 });
    }
    const start = d.startDatetime ?? new Date(current.rows[0].start_datetime).toISOString();
    const end = d.endDatetime ?? new Date(current.rows[0].end_datetime).toISOString();
    if (new Date(end) <= new Date(start)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event end time must be after start time.' }, { status: 400 });
    }
    const conflicts = await client.query(
      `SELECT
         EXISTS(SELECT 1 FROM resource_allocations WHERE event_id = $1
           AND allocation_status IN ('PENDING','CONFIRMED')
           AND (start_datetime < $2::timestamptz OR end_datetime > $3::timestamptz)) AS allocation_conflict,
         EXISTS(SELECT 1 FROM event_schedules WHERE event_id = $1
           AND status <> 'CANCELLED'
           AND (start_datetime < $2::timestamptz OR end_datetime > $3::timestamptz)) AS schedule_conflict,
         EXISTS(SELECT 1 FROM event_service_bookings WHERE event_id = $1
           AND booking_status IN ('PENDING','CONFIRMED')
           AND (start_datetime < $2::timestamptz OR end_datetime > $3::timestamptz)) AS service_conflict`,
      [eventId, start, end],
    );
    if (Object.values(conflicts.rows[0]).some(Boolean)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Updated dates would exclude an existing resource reservation, schedule activity, or service booking.' }, { status: 409 });
    }
    const result = await client.query(
      `UPDATE events SET
         event_name = COALESCE($2, event_name),
         description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
         event_type = COALESCE($5, event_type),
         location = CASE WHEN $6::boolean THEN $7::text ELSE location END,
         start_datetime = COALESCE($8::timestamptz, start_datetime),
         end_datetime = COALESCE($9::timestamptz, end_datetime),
         expected_attendees = COALESCE($10, expected_attendees),
         total_budget = COALESCE($11, total_budget),
         status = COALESCE($12, status),
         updated_at = now()
       WHERE event_id = $1 AND status <> 'CANCELLED'
       RETURNING *`,
      [
        eventId, d.eventName ?? null, Object.hasOwn(d, 'description'), d.description ?? null,
        d.eventType ?? null, Object.hasOwn(d, 'location'), d.location ?? null,
        d.startDatetime ?? null, d.endDatetime ?? null, d.expectedAttendees ?? null,
        d.totalBudget ?? null, d.status ?? null,
      ],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23514') return NextResponse.json({ error: 'Event end time must be after start time.' }, { status: 400 });
    console.error('PATCH /api/events/[eventId]', error);
    return NextResponse.json({ error: 'Could not update event.' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const eventId = parseId(context.params.eventId);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  if (!(await canManageEvent(user, eventId))) return forbiddenResponse();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE events SET status = 'CANCELLED', updated_at = now()
       WHERE event_id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED') RETURNING event_id, status`,
      [eventId],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found, already cancelled, or completed.' }, { status: 404 });
    }
    await client.query(
      `UPDATE resource_allocations SET allocation_status = 'CANCELLED',
         cancellation_reason = 'Event cancelled', updated_at = now()
       WHERE event_id = $1 AND allocation_status IN ('PENDING','CONFIRMED')`,
      [eventId],
    );
    await client.query(
      `UPDATE event_service_bookings SET booking_status = 'CANCELLED'
       WHERE event_id = $1 AND booking_status IN ('PENDING','CONFIRMED')`,
      [eventId],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/events/[eventId]', error);
    return NextResponse.json({ error: 'Could not cancel event.' }, { status: 500 });
  } finally {
    client.release();
  }
}
