import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const taskUpdateSchema = z.object({
  taskName: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(5000).nullable().optional(),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
});

export async function PATCH(request: NextRequest, context: { params: { taskId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const taskId = Number(context.params.taskId);
  if (!Number.isSafeInteger(taskId) || taskId < 1) return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return NextResponse.json({ error: 'Provide valid task updates.' }, { status: 400 });
  try {
    const task = await pool.query('SELECT event_id, assigned_to FROM event_tasks WHERE task_id = $1', [taskId]);
    if (!task.rowCount) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    const manager = await canManageEvent(user, Number(task.rows[0].event_id));
    const assignee = Number(task.rows[0].assigned_to) === user.user_id;
    if (!manager && !(assignee && Object.keys(parsed.data).every((key) => key === 'status'))) return forbiddenResponse();
    const d = parsed.data;
    if (manager && d.assignedTo !== undefined && d.assignedTo !== null) {
      const validAssignee = await pool.query(
        `SELECT 1 FROM users u JOIN roles r USING(role_id)
         WHERE u.user_id = $1 AND u.status = 'ACTIVE'
           AND r.role_name IN ('ADMIN','ORGANIZER','STAFF')`,
        [d.assignedTo],
      );
      if (!validAssignee.rowCount) return NextResponse.json({ error: 'Assignee must be an active administrator, organizer, or staff member.' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE event_tasks SET task_name = COALESCE($2, task_name),
         description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
         assigned_to = CASE WHEN $5::boolean THEN $6::bigint ELSE assigned_to END,
         priority = COALESCE($7, priority),
         deadline = CASE WHEN $8::boolean THEN $9::timestamptz ELSE deadline END,
         status = COALESCE($10, status)
       WHERE task_id = $1 RETURNING *`,
      [taskId, d.taskName ?? null, Object.hasOwn(d, 'description'), d.description ?? null,
        Object.hasOwn(d, 'assignedTo'), d.assignedTo ?? null, d.priority ?? null,
        Object.hasOwn(d, 'deadline'), d.deadline ?? null, d.status ?? null],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string })?.code === '23503') return NextResponse.json({ error: 'The selected assignee does not exist.' }, { status: 400 });
    console.error('PATCH /api/tasks/[taskId]', error);
    return NextResponse.json({ error: 'Could not update task.' }, { status: 500 });
  }
}
