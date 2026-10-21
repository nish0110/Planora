import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const registrationSchema = z.object({ attendeeId: z.coerce.number().int().positive().optional() });

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  try {
    const query = user.role_name === 'ADMIN' || await canManageEvent(user, eventId)
      ? pool.query(
        `SELECT r.registration_id, r.event_id, r.attendee_id, r.registration_date,
                r.registration_status, r.check_in_time, u.full_name, u.email
         FROM event_registrations r JOIN users u ON u.user_id = r.attendee_id
         WHERE r.event_id = $1 ORDER BY r.registration_date DESC`,
        [eventId],
      )
      : pool.query(
        `SELECT registration_id, event_id, attendee_id, registration_date, registration_status, check_in_time
         FROM event_registrations WHERE event_id = $1 AND attendee_id = $2`,
        [eventId, user.user_id],
      );
    const result = await query;
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/events/[eventId]/registrations', error);
    return NextResponse.json({ error: 'Could not load event registrations.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  const parsed = registrationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid registration details.' }, { status: 400 });
  const manager = await canManageEvent(user, eventId);
  if (user.role_name !== 'ATTENDEE' && !manager) return forbiddenResponse();
  if (parsed.data.attendeeId && (!manager || user.role_name === 'ORGANIZER' && parsed.data.attendeeId === user.user_id)) {
    return NextResponse.json({ error: 'You may only register yourself for this event.' }, { status: 403 });
  }
  const attendeeId = parsed.data.attendeeId ?? user.user_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query(
      `SELECT expected_attendees, status FROM events WHERE event_id = $1 FOR UPDATE`,
      [eventId],
    );
    if (!event.rowCount || ['CANCELLED', 'COMPLETED'].includes(event.rows[0].status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event is not open for registration.' }, { status: 404 });
    }
    const count = await client.query(
      `SELECT COUNT(*)::int AS registered FROM event_registrations
       WHERE event_id = $1 AND registration_status IN ('REGISTERED','CHECKED_IN')`,
      [eventId],
    );
    const full = Number(event.rows[0].expected_attendees) > 0 &&
      Number(count.rows[0].registered) >= Number(event.rows[0].expected_attendees);
    const result = await client.query(
      `INSERT INTO event_registrations(event_id, attendee_id, registration_status)
       SELECT $1, $2, $3 WHERE EXISTS (
         SELECT 1 FROM users WHERE user_id = $2 AND status = 'ACTIVE'
           AND role_id = (SELECT role_id FROM roles WHERE role_name = 'ATTENDEE')
       )
       RETURNING registration_id, event_id, attendee_id, registration_date, registration_status`,
      [eventId, attendeeId, full ? 'WAITLISTED' : 'REGISTERED'],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'The selected user is not an active attendee.' }, { status: 400 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23505') return NextResponse.json({ error: 'You are already registered for this event.' }, { status: 409 });
    console.error('POST /api/events/[eventId]/registrations', error);
    return NextResponse.json({ error: 'Could not register for this event.' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  const registrationId = Number(request.nextUrl.searchParams.get('registrationId'));
  if (!Number.isSafeInteger(registrationId) || registrationId < 1) return NextResponse.json({ error: 'Invalid registration ID.' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query('SELECT expected_attendees FROM events WHERE event_id = $1 FOR UPDATE', [eventId]);
    if (!event.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }
    const registration = await client.query(
      `SELECT attendee_id, registration_status FROM event_registrations
       WHERE event_id = $1 AND registration_id = $2 FOR UPDATE`,
      [eventId, registrationId],
    );
    if (!registration.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }
    const manager = await canManageEvent(user, eventId);
    if (!manager && Number(registration.rows[0].attendee_id) !== user.user_id) {
      await client.query('ROLLBACK');
      return forbiddenResponse();
    }
    const result = await client.query(
      `UPDATE event_registrations SET registration_status = 'CANCELLED'
       WHERE event_id = $1 AND registration_id = $2 AND registration_status <> 'CANCELLED'
       RETURNING registration_id, registration_status`,
      [eventId, registrationId],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Registration is already cancelled.' }, { status: 409 });
    }
    if (['REGISTERED', 'CHECKED_IN'].includes(registration.rows[0].registration_status) &&
        Number(event.rows[0].expected_attendees) > 0) {
      const count = await client.query(
        `SELECT COUNT(*)::int AS registered FROM event_registrations
         WHERE event_id = $1 AND registration_status IN ('REGISTERED','CHECKED_IN')`,
        [eventId],
      );
      if (Number(count.rows[0].registered) < Number(event.rows[0].expected_attendees)) {
        await client.query(
          `UPDATE event_registrations SET registration_status = 'REGISTERED'
           WHERE registration_id = (
             SELECT registration_id FROM event_registrations
             WHERE event_id = $1 AND registration_status = 'WAITLISTED'
             ORDER BY registration_date, registration_id LIMIT 1 FOR UPDATE SKIP LOCKED
           )`,
          [eventId],
        );
      }
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/events/[eventId]/registrations', error);
    return NextResponse.json({ error: 'Could not cancel registration.' }, { status: 500 });
  } finally {
    client.release();
  }
}
