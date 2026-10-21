import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const expenseSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  category: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(5000),
  amount: z.coerce.number().min(0).max(1000000000),
  expenseDate: z.string().date().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (!eventId || !/^\d+$/.test(eventId)) return NextResponse.json({ error: 'A valid eventId is required.' }, { status: 400 });
  if (!(await canManageEvent(user, Number(eventId)))) return forbiddenResponse();
  try {
    const result = await pool.query(
      `SELECT x.*, u.full_name AS recorded_by_name FROM expenses x
       JOIN users u ON u.user_id = x.recorded_by
       WHERE x.event_id = $1 ORDER BY x.expense_date DESC, x.expense_id DESC`,
      [eventId],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/expenses', error);
    return NextResponse.json({ error: 'Could not load expenses.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const parsed = expenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid expense details.', details: parsed.error.flatten() }, { status: 400 });
  if (!(await canManageEvent(user, parsed.data.eventId))) return forbiddenResponse();
  try {
    const result = await pool.query(
      `INSERT INTO expenses(event_id, category, description, amount, expense_date, recorded_by)
       VALUES($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6) RETURNING *`,
      [parsed.data.eventId, parsed.data.category, parsed.data.description, parsed.data.amount, parsed.data.expenseDate ?? null, user.user_id],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses', error);
    return NextResponse.json({ error: 'Could not record expense.' }, { status: 500 });
  }
}
