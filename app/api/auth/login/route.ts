import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });

  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.password_hash, r.role_name
       FROM users u JOIN roles r USING(role_id)
       WHERE lower(u.email) = lower($1) AND u.status = 'ACTIVE'`,
      [parsed.data.email],
    );
    const record = result.rows[0];
    if (!record || !(await bcrypt.compare(parsed.data.password, record.password_hash))) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }

    const response = NextResponse.json({
      data: { user_id: record.user_id, full_name: record.full_name, email: record.email, role_name: record.role_name },
    });
    await createSession(Number(record.user_id), response);
    return response;
  } catch (error) {
    console.error('POST /api/auth/login', error);
    return NextResponse.json({ error: 'Could not sign in. Check database setup.' }, { status: 500 });
  }
}
