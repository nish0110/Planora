import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const statusSchema = z.object({ status: z.literal('VOIDED') });

export async function PATCH(request: NextRequest, context: { params: { expenseId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const expenseId = Number(context.params.expenseId);
  if (!Number.isSafeInteger(expenseId) || expenseId < 1) return NextResponse.json({ error: 'Invalid expense ID.' }, { status: 400 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid expense status.' }, { status: 400 });
  try {
    const record = await pool.query('SELECT event_id FROM expenses WHERE expense_id = $1', [expenseId]);
    if (!record.rowCount) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 });
    if (!(await canManageEvent(user, Number(record.rows[0].event_id)))) return forbiddenResponse();
    const result = await pool.query(
      `UPDATE expenses SET status = 'VOIDED' WHERE expense_id = $1 AND status = 'RECORDED' RETURNING *`,
      [expenseId],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Expense is already voided.' }, { status: 409 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('PATCH /api/expenses/[expenseId]', error);
    return NextResponse.json({ error: 'Could not void expense.' }, { status: 500 });
  }
}
