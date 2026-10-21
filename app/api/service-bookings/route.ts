import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const bookingSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  startDatetime: z.string().datetime({ offset: true }),
  endDatetime: z.string().datetime({ offset: true }),
  quotedPrice: z.coerce.number().min(0).max(1000000000),
}).refine((booking) => new Date(booking.endDatetime) > new Date(booking.startDatetime), {
  path: ['endDatetime'], message: 'End time must be after start time.',
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (eventId !== null && !/^\d+$/.test(eventId)) return NextResponse.json({ error: 'Invalid eventId.' }, { status: 400 });
  try {
    const result = await pool.query(
      `SELECT b.*, e.event_name, s.service_name, vp.business_name, vp.user_id AS vendor_user_id
       FROM event_service_bookings b JOIN events e USING(event_id)
       JOIN services s USING(service_id) JOIN vendor_profiles vp USING(vendor_id)
       WHERE ($1::bigint IS NULL OR b.event_id = $1)
         AND ($2::text = 'ADMIN' OR e.organizer_id = $3 OR vp.user_id = $3)
       ORDER BY b.start_datetime DESC LIMIT 300`,
      [eventId, user.role_name, user.user_id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/service-bookings', error);
    return NextResponse.json({ error: 'Could not load service bookings.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid service booking.', details: parsed.error.flatten() }, { status: 400 });
  if (!(await canManageEvent(user, parsed.data.eventId))) return forbiddenResponse();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query(
      `SELECT start_datetime, end_datetime, status FROM events WHERE event_id = $1 FOR UPDATE`,
      [parsed.data.eventId],
    );
    if (!event.rowCount || ['CANCELLED', 'COMPLETED'].includes(event.rows[0].status) ||
        new Date(parsed.data.startDatetime) < new Date(event.rows[0].start_datetime) ||
        new Date(parsed.data.endDatetime) > new Date(event.rows[0].end_datetime)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Booking dates must fit within an active event.' }, { status: 409 });
    }
    const service = await client.query(
      `SELECT s.service_id FROM services s JOIN vendor_profiles v USING(vendor_id)
       WHERE s.service_id = $1 AND s.service_status = 'ACTIVE'
         AND v.verification_status = 'VERIFIED' FOR UPDATE OF v`,
      [parsed.data.serviceId],
    );
    if (!service.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Service is unavailable or its vendor is not verified.' }, { status: 404 });
    }
    const overlap = await client.query(
      `SELECT 1 FROM event_service_bookings
       WHERE service_id = $1 AND booking_status IN ('PENDING','CONFIRMED')
         AND tstzrange(start_datetime, end_datetime, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       LIMIT 1`,
      [parsed.data.serviceId, parsed.data.startDatetime, parsed.data.endDatetime],
    );
    if (overlap.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'This service already has a booking during that time.' }, { status: 409 });
    }
    const result = await client.query(
      `INSERT INTO event_service_bookings(event_id, service_id, start_datetime, end_datetime, quoted_price)
       SELECT $1, s.service_id, $3, $4, $5 FROM services s
       WHERE s.service_id = $2 AND s.service_status = 'ACTIVE'
       RETURNING *`,
      [parsed.data.eventId, parsed.data.serviceId, parsed.data.startDatetime, parsed.data.endDatetime, parsed.data.quotedPrice],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Booking dates must fit within an active event.' }, { status: 409 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23P01') {
      return NextResponse.json({ error: 'This service already has a booking during that time.' }, { status: 409 });
    }
    console.error('POST /api/service-bookings', error);
    return NextResponse.json({ error: 'Could not book service.' }, { status: 500 });
  } finally {
    client.release();
  }
}
