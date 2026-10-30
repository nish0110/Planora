import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { createAllocationSchema } from '@/lib/validation';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

async function findAlternatives(
  client: PoolClient,
  excludedResourceId: number,
  typeName: string,
  quantity: number,
  expectedAttendees: number,
  startDatetime: string,
  endDatetime: string,
) {
  const result = await client.query(
    `SELECT r.resource_id, r.resource_name, r.capacity, r.base_price, t.type_name
     FROM resources r JOIN resource_types t USING(resource_type_id)
     WHERE r.availability_status = 'ACTIVE' AND r.resource_id <> $1
       AND t.type_name = $2
       AND (t.type_name <> 'Venue' OR r.capacity IS NULL OR r.capacity >= $4)
       AND r.quantity_available - COALESCE((
         SELECT MAX(used) FROM (
           SELECT SUM(delta) OVER (ORDER BY point, delta) AS used
           FROM (
             SELECT GREATEST(a.start_datetime, $5::timestamptz) AS point, a.quantity AS delta
             FROM resource_allocations a
             WHERE a.resource_id = r.resource_id AND a.allocation_status IN ('PENDING','CONFIRMED')
               AND tstzrange(a.start_datetime, a.end_datetime, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)')
             UNION ALL
             SELECT LEAST(a.end_datetime, $6::timestamptz) AS point, -a.quantity AS delta
             FROM resource_allocations a
             WHERE a.resource_id = r.resource_id AND a.allocation_status IN ('PENDING','CONFIRMED')
               AND tstzrange(a.start_datetime, a.end_datetime, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)')
           ) boundaries
         ) usage
       ), 0) >= $3
       AND NOT EXISTS (
         SELECT 1 FROM resource_availability av
         WHERE av.resource_id = r.resource_id AND av.availability_status = 'UNAVAILABLE'
           AND tstzrange(av.start_datetime, av.end_datetime, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)')
       )
     ORDER BY r.base_price LIMIT 3`,
    [excludedResourceId, typeName, quantity, expectedAttendees, startDatetime, endDatetime],
  );
  return result.rows;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (eventId !== null && !/^\d+$/.test(eventId)) return NextResponse.json({ error: 'Invalid eventId.' }, { status: 400 });
  try {
    const result = await pool.query(
      `SELECT a.*, e.event_name, e.organizer_id, r.resource_name, r.owner_id,
              t.type_name, u.full_name AS allocated_by_name
       FROM resource_allocations a
       JOIN events e USING(event_id)
       JOIN resources r USING(resource_id)
       JOIN resource_types t USING(resource_type_id)
       JOIN users u ON u.user_id = a.allocated_by
       WHERE ($1::bigint IS NULL OR a.event_id = $1)
         AND ($2::text = 'ADMIN' OR e.organizer_id = $3 OR r.owner_id = $3)
       ORDER BY a.start_datetime DESC LIMIT 500`,
      [eventId, user.role_name, user.user_id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/allocations', error);
    return NextResponse.json({ error: 'Could not load allocations.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const parsed = createAllocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid allocation details.', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (!(await canManageEvent(user, d.eventId))) return forbiddenResponse();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resource = await client.query(
      `SELECT r.resource_id, r.capacity, r.quantity_available, r.base_price, r.availability_status,
              t.type_name
       FROM resources r JOIN resource_types t USING(resource_type_id)
       WHERE r.resource_id = $1 FOR UPDATE OF r`,
      [d.resourceId],
    );
    if (!resource.rowCount || resource.rows[0].availability_status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Resource not found or inactive.' }, { status: 404 });
    }
    const event = await client.query(
      `SELECT event_id, expected_attendees, start_datetime, end_datetime, status
       FROM events WHERE event_id = $1 FOR UPDATE`,
      [d.eventId],
    );
    if (!event.rowCount || ['CANCELLED', 'COMPLETED'].includes(event.rows[0].status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found or cancelled.' }, { status: 404 });
    }

    const bookingStart = new Date(d.startDatetime).getTime();
    const bookingEnd = new Date(d.endDatetime).getTime();
    if (bookingStart < new Date(event.rows[0].start_datetime).getTime() || bookingEnd > new Date(event.rows[0].end_datetime).getTime()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'The reservation must fit within the event schedule.' }, { status: 400 });
    }
    const selectedResource = resource.rows[0];
    if (selectedResource.type_name === 'Venue' && selectedResource.capacity !== null &&
        Number(selectedResource.capacity) < Number(event.rows[0].expected_attendees)) {
      const alternatives = await findAlternatives(
        client, d.resourceId, selectedResource.type_name, d.quantity,
        Number(event.rows[0].expected_attendees), d.startDatetime, d.endDatetime,
      );
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Venue capacity is below the event’s expected attendance.', alternatives }, { status: 409 });
    }
    const blocked = await client.query(
      `SELECT 1 FROM resource_availability
       WHERE resource_id = $1 AND availability_status = 'UNAVAILABLE'
         AND tstzrange(start_datetime, end_datetime, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       LIMIT 1`,
      [d.resourceId, d.startDatetime, d.endDatetime],
    );
    if (blocked.rowCount) {
      const alternatives = await findAlternatives(
        client, d.resourceId, selectedResource.type_name, d.quantity,
        Number(event.rows[0].expected_attendees), d.startDatetime, d.endDatetime,
      );
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Resource is marked unavailable during that period.', alternatives }, { status: 409 });
    }
    const used = await client.query(
      `SELECT COALESCE(MAX(used), 0)::int AS quantity FROM (
         SELECT SUM(delta) OVER (ORDER BY point, delta) AS used
         FROM (
           SELECT GREATEST(start_datetime, $2::timestamptz) AS point, quantity AS delta
           FROM resource_allocations
           WHERE resource_id = $1 AND allocation_status IN ('PENDING','CONFIRMED')
             AND tstzrange(start_datetime, end_datetime, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
           UNION ALL
           SELECT LEAST(end_datetime, $3::timestamptz) AS point, -quantity AS delta
           FROM resource_allocations
           WHERE resource_id = $1 AND allocation_status IN ('PENDING','CONFIRMED')
             AND tstzrange(start_datetime, end_datetime, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
         ) boundaries
       ) usage`,
      [d.resourceId, d.startDatetime, d.endDatetime],
    );
    if (Number(used.rows[0].quantity) + d.quantity > Number(selectedResource.quantity_available)) {
      const alternatives = await findAlternatives(
        client, d.resourceId, selectedResource.type_name, d.quantity,
        Number(event.rows[0].expected_attendees), d.startDatetime, d.endDatetime,
      );
      await client.query('ROLLBACK');
      return NextResponse.json({
        error: 'Not enough units are available for that time range.',
        alternatives,
      }, { status: 409 });
    }

    const result = await client.query(
      `INSERT INTO resource_allocations
         (event_id, resource_id, allocated_by, start_datetime, end_datetime, quantity, allocation_status, total_cost)
       VALUES($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING *`,
      [d.eventId, d.resourceId, user.user_id, d.startDatetime, d.endDatetime, d.quantity, d.totalCost],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    const code = (error as { code?: string })?.code;
    if (code === '23P01') return NextResponse.json({ error: 'Booking conflict: this resource is already reserved for an overlapping time.' }, { status: 409 });
    if (code === '23503') return NextResponse.json({ error: 'Invalid event or resource.' }, { status: 400 });
    console.error('POST /api/allocations', error);
    return NextResponse.json({ error: 'Could not reserve this resource.' }, { status: 500 });
  } finally {
    client.release();
  }
}
