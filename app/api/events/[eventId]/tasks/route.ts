import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const taskSchema = z.object({
  taskName: z.string().trim().min(2).max(180),
  description: z.string().max(5000).nullable().optional(),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  const manager = await canManageEvent(user, eventId);
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS assignee_name
       FROM event_tasks t LEFT JOIN users u ON u.user_id = t.assigned_to
       WHERE t.event_id = $1 AND ($2::boolean OR t.assigned_to = $3)
       ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
         t.deadline NULLS LAST`,
      [eventId, manager, user.user_id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/events/[eventId]/tasks', error);
    return NextResponse.json({ error: 'Could not load event tasks.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { eventId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = Number(context.params.eventId);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
  if (!(await canManageEvent(user, eventId))) return forbiddenResponse();
  const parsed = taskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid task details.', details: parsed.error.flatten() }, { status: 400 });
  try {
    if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== null) {
      const assignee = await pool.query(
        `SELECT 1 FROM users u JOIN roles r USING(role_id)
         WHERE u.user_id = $1 AND u.status = 'ACTIVE'
           AND r.role_name IN ('ADMIN','ORGANIZER','STAFF')`,
        [parsed.data.assignedTo],
      );
      if (!assignee.rowCount) return NextResponse.json({ error: 'Assignee must be an active administrator, organizer, or staff member.' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO event_tasks(event_id, task_name, description, assigned_to, priority, deadline)
       VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [eventId, parsed.data.taskName, parsed.data.description ?? null, parsed.data.assignedTo ?? null, parsed.data.priority, parsed.data.deadline ?? null],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === '23503') return NextResponse.json({ error: 'The selected assignee does not exist.' }, { status: 400 });
    console.error('POST /api/events/[eventId]/tasks', error);
    return NextResponse.json({ error: 'Could not create task.' }, { status: 500 });
  }
}
