import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
const verificationSchema = z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'PENDING']) });

export async function PATCH(request: NextRequest, context: { params: { vendorId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (user.role_name !== 'ADMIN') return forbiddenResponse();
  const vendorId = Number(context.params.vendorId);
  if (!Number.isSafeInteger(vendorId) || vendorId < 1) return NextResponse.json({ error: 'Invalid vendor ID.' }, { status: 400 });
  const parsed = verificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid verification status.' }, { status: 400 });
  try {
    const result = await pool.query(
      `UPDATE vendor_profiles SET verification_status = $2 WHERE vendor_id = $1 RETURNING *`,
      [vendorId, parsed.data.status],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('PATCH /api/vendors/[vendorId]', error);
    return NextResponse.json({ error: 'Could not update vendor verification.' }, { status: 500 });
  }
}
