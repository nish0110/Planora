import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const serviceSchema = z.object({
  serviceName: z.string().trim().min(2).max(180),
  description: z.string().max(5000).nullable().optional(),
  price: z.coerce.number().min(0).max(1000000000),
  durationMinutes: z.coerce.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const result = await pool.query(
      `SELECT s.service_id, s.service_name, s.description, s.price, s.duration_minutes,
              s.service_status, v.vendor_id, v.business_name, v.business_category, v.rating
       FROM services s JOIN vendor_profiles v USING(vendor_id)
       WHERE s.service_status = 'ACTIVE' AND v.verification_status = 'VERIFIED'
       ORDER BY v.business_name, s.service_name`,
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/services', error);
    return NextResponse.json({ error: 'Could not load vendor services.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (user.role_name !== 'VENDOR') return forbiddenResponse();
  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid service details.', details: parsed.error.flatten() }, { status: 400 });
  try {
    const profile = await pool.query(
      `SELECT vendor_id FROM vendor_profiles
       WHERE user_id = $1 AND verification_status = 'VERIFIED'`,
      [user.user_id],
    );
    if (!profile.rowCount) return NextResponse.json({ error: 'A verified vendor profile is required to list services.' }, { status: 403 });
    const result = await pool.query(
      `INSERT INTO services(vendor_id, service_name, description, price, duration_minutes)
       VALUES($1, $2, $3, $4, $5) RETURNING *`,
      [profile.rows[0].vendor_id, parsed.data.serviceName, parsed.data.description ?? null, parsed.data.price, parsed.data.durationMinutes ?? null],
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('POST /api/services', error);
    return NextResponse.json({ error: 'Could not create service.' }, { status: 500 });
  }
}
