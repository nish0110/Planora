import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export async function PATCH(request: NextRequest, context: { params: { userId: string } }) {
  const actor = await getCurrentUser(request);
  if (!actor) return unauthorizedResponse();
  if (actor.role_name !== 'ADMIN') return forbiddenResponse();
  const userId = Number(context.params.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
  if (userId === actor.user_id) return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid user status.' }, { status: 400 });
  try {
    const result = await pool.query(
      `UPDATE users SET status = $2 WHERE user_id = $1 RETURNING user_id, full_name, email, status`,
      [userId, parsed.data.status],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (parsed.data.status === 'SUSPENDED') await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('PATCH /api/users/[userId]', error);
    return NextResponse.json({ error: 'Could not update account status.' }, { status: 500 });
  }
}
