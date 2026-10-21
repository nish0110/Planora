import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const bookingUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
});

export async function PATCH(request: NextRequest, context: { params: { bookingId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const bookingId = Number(context.params.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return NextResponse.json({ error: 'Invalid booking ID.' }, { status: 400 });
  const parsed = bookingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid booking status.' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `SELECT b.event_id, b.booking_status, vp.user_id AS vendor_user_id FROM event_service_bookings b
       JOIN services s USING(service_id) JOIN vendor_profiles vp USING(vendor_id)
       WHERE b.booking_id = $1 FOR UPDATE OF b`,
      [bookingId],
    );
    if (!record.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Service booking not found.' }, { status: 404 });
    }
    const isVendor = Number(record.rows[0].vendor_user_id) === user.user_id;
    const isOrganizer = await canManageEvent(user, Number(record.rows[0].event_id));
    const permitted = parsed.data.status === 'CONFIRMED'
      ? user.role_name === 'ADMIN' || isVendor
      : user.role_name === 'ADMIN' || isVendor || isOrganizer;
    if (!permitted) {
      await client.query('ROLLBACK');
      return forbiddenResponse();
    }
    const currentStatus = record.rows[0].booking_status;
    const validTransition = parsed.data.status === 'CONFIRMED'
      ? currentStatus === 'PENDING'
      : parsed.data.status === 'COMPLETED'
        ? currentStatus === 'CONFIRMED'
        : ['PENDING', 'CONFIRMED'].includes(currentStatus);
    if (!validTransition) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: `Cannot change a ${currentStatus} booking to ${parsed.data.status}.` }, { status: 409 });
    }
    const result = await client.query(
      `UPDATE event_service_bookings SET booking_status = $2 WHERE booking_id = $1 RETURNING *`,
      [bookingId, parsed.data.status],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23P01') return NextResponse.json({ error: 'A confirmed booking overlaps this service.' }, { status: 409 });
    console.error('PATCH /api/service-bookings/[bookingId]', error);
    return NextResponse.json({ error: 'Could not update service booking.' }, { status: 500 });
  } finally {
    client.release();
  }
}
