import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

const userSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(200).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
  roleName: z.enum(['ORGANIZER', 'VENDOR', 'STAFF', 'ATTENDEE']),
  businessName: z.string().trim().min(2).max(180).optional(),
  businessCategory: z.string().trim().min(2).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (user.role_name !== 'ADMIN') return forbiddenResponse();
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.status, u.created_at, r.role_name,
              vp.vendor_id, vp.business_name, vp.verification_status
       FROM users u JOIN roles r USING(role_id)
       LEFT JOIN vendor_profiles vp USING(user_id)
       ORDER BY u.created_at DESC LIMIT 500`,
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/users', error);
    return NextResponse.json({ error: 'Could not load users.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (user.role_name !== 'ADMIN') return forbiddenResponse();
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid account details.', details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.roleName === 'VENDOR' && (!parsed.data.businessName || !parsed.data.businessCategory)) {
    return NextResponse.json({ error: 'Vendor accounts require a business name and category.' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const created = await client.query(
      `INSERT INTO users(role_id, full_name, email, password_hash)
       VALUES((SELECT role_id FROM roles WHERE role_name = $1), $2, lower($3), $4)
       RETURNING user_id, full_name, email, created_at`,
      [parsed.data.roleName, parsed.data.fullName, parsed.data.email, passwordHash],
    );
    const account = created.rows[0];
    if (parsed.data.roleName === 'VENDOR') {
      await client.query(
        `INSERT INTO vendor_profiles(user_id, business_name, business_category)
         VALUES($1, $2, $3)`,
        [account.user_id, parsed.data.businessName, parsed.data.businessCategory],
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ data: { ...account, role_name: parsed.data.roleName } }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23505') return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    console.error('POST /api/users', error);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  } finally {
    client.release();
  }
}
