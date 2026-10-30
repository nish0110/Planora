import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  if (!(await canManageEvent(user, eventId))) return forbiddenResponse();
  try {
    const result = await pool.query(
      `SELECT e.event_id, e.total_budget AS planned_budget,
         (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.event_id AND r.registration_status IN ('REGISTERED','CHECKED_IN')) AS registered_attendees,
         (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.event_id AND r.registration_status = 'WAITLISTED') AS waitlisted_attendees,
         (SELECT COUNT(*)::int FROM event_tasks t WHERE t.event_id = e.event_id AND t.status <> 'DONE') AS open_tasks,
         (SELECT COUNT(*)::int FROM event_schedules s WHERE s.event_id = e.event_id AND s.status <> 'CANCELLED') AS scheduled_activities,
         (SELECT COUNT(*)::int FROM resource_allocations a WHERE a.event_id = e.event_id AND a.allocation_status IN ('PENDING','CONFIRMED')) AS active_resource_bookings,
         (SELECT COALESCE(SUM(a.total_cost), 0) FROM resource_allocations a WHERE a.event_id = e.event_id AND a.allocation_status = 'CONFIRMED') AS confirmed_resource_cost,
         (SELECT COALESCE(SUM(b.quoted_price), 0) FROM event_service_bookings b WHERE b.event_id = e.event_id AND b.booking_status = 'CONFIRMED') AS confirmed_service_cost,
         (SELECT COALESCE(SUM(x.amount), 0) FROM expenses x WHERE x.event_id = e.event_id AND x.status = 'RECORDED') AS recorded_expenses
       FROM events e WHERE e.event_id = $1`,
      [eventId],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    const summary = result.rows[0];
    const totalSpend = Number(summary.confirmed_resource_cost) + Number(summary.confirmed_service_cost) + Number(summary.recorded_expenses);
    return NextResponse.json({
      data: { ...summary, committed_spending: totalSpend, remaining_budget: Number(summary.planned_budget) - totalSpend },
    });
  } catch (error) {
    console.error('GET /api/events/[eventId]/summary', error);
    return NextResponse.json({ error: 'Could not load the event summary.' }, { status: 500 });
  }
}
