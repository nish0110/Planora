import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export const runtime = 'nodejs';

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(200).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

export async function POST(request: NextRequest) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Use a valid name and email. Passwords must be at least 10 characters and include lowercase, uppercase, and a number.',
      details: parsed.error.flatten(),
    }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(762913458)');
    const adminExists = await client.query(
      `SELECT 1 FROM users u JOIN roles r USING(role_id)
       WHERE r.role_name = 'ADMIN' AND u.password_hash <> 'DISABLED_DEMO_ACCOUNT' LIMIT 1`,
    );
    if (adminExists.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Initial admin setup is already complete. Ask an administrator to create your account.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const placeholderAdmin = await client.query(
      `SELECT u.user_id FROM users u JOIN roles r USING(role_id)
       WHERE r.role_name = 'ADMIN' AND u.password_hash = 'DISABLED_DEMO_ACCOUNT'
       ORDER BY u.user_id LIMIT 1 FOR UPDATE`,
    );
    let user;
    if (placeholderAdmin.rowCount) {
      const result = await client.query(
        `UPDATE users SET full_name = $1, email = lower($2), password_hash = $3
         WHERE user_id = $4 RETURNING user_id, full_name, email`,
        [parsed.data.fullName, parsed.data.email, passwordHash, placeholderAdmin.rows[0].user_id],
      );
      user = result.rows[0];
    } else {
      const users = await client.query('SELECT COUNT(*)::int AS count FROM users');
      if (users.rows[0].count > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Admin setup is unavailable because accounts already exist. Ask a database administrator to enable an admin account.' }, { status: 409 });
      }
      const result = await client.query(
        `INSERT INTO users(role_id, full_name, email, password_hash)
         VALUES((SELECT role_id FROM roles WHERE role_name = 'ADMIN'), $1, lower($2), $3)
         RETURNING user_id, full_name, email`,
        [parsed.data.fullName, parsed.data.email, passwordHash],
      );
      user = result.rows[0];
    }
    await client.query('COMMIT');

    const response = NextResponse.json({ data: { ...user, role_name: 'ADMIN' } }, { status: 201 });
    await createSession(Number(user.user_id), response);
    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    console.error('POST /api/auth/register', error);
    return NextResponse.json({ error: 'Could not create the administrator account.' }, { status: 500 });
  } finally {
    client.release();
  }
}
