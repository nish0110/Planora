import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

const updateSchema = z.object({
  resourceName: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  quantityAvailable: z.coerce.number().int().positive().max(10000).optional(),
  basePrice: z.coerce.number().min(0).max(1000000000).optional(),
  availabilityStatus: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional(),
});

export async function PATCH(request: NextRequest, context: { params: { resourceId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'VENDOR'].includes(user.role_name)) return forbiddenResponse();
  const resourceId = Number(context.params.resourceId);
  if (!Number.isSafeInteger(resourceId) || resourceId < 1) return NextResponse.json({ error: 'Invalid resource ID.' }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data || {}).length) {
    return NextResponse.json({ error: 'Provide valid resource updates.', details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT quantity_available FROM resources
       WHERE resource_id = $1 AND ($2::text = 'ADMIN' OR owner_id = $3) FOR UPDATE`,
      [resourceId, user.role_name, user.user_id],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Resource not found or you do not own it.' }, { status: 404 });
    }
    const nextQuantity = parsed.data.quantityAvailable ?? Number(current.rows[0].quantity_available);
    if (nextQuantity < Number(current.rows[0].quantity_available)) {
      const peak = await client.query(
        `SELECT COALESCE(MAX(used), 0)::int AS peak FROM (
           SELECT SUM(delta) OVER (ORDER BY point, delta) AS used
           FROM (
             SELECT start_datetime AS point, quantity AS delta FROM resource_allocations
             WHERE resource_id = $1 AND allocation_status IN ('PENDING','CONFIRMED')
             UNION ALL
             SELECT end_datetime AS point, -quantity AS delta FROM resource_allocations
             WHERE resource_id = $1 AND allocation_status IN ('PENDING','CONFIRMED')
           ) boundaries
         ) usage`,
        [resourceId],
      );
      if (Number(peak.rows[0].peak) > nextQuantity) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Cannot reduce quantity below ${peak.rows[0].peak}; active reservations require that many units.` }, { status: 409 });
      }
    }
    const result = await client.query(
      `UPDATE resources SET
         resource_name = COALESCE($3, resource_name),
         description = CASE WHEN $4::boolean THEN $5::text ELSE description END,
         location = CASE WHEN $6::boolean THEN $7::text ELSE location END,
         capacity = CASE WHEN $8::boolean THEN $9::int ELSE capacity END,
         quantity_available = COALESCE($10, quantity_available),
         base_price = COALESCE($11, base_price),
         availability_status = COALESCE($12, availability_status)
       WHERE resource_id = $1 AND ($2::text = 'ADMIN' OR owner_id = $13)
       RETURNING resource_id, resource_name, description, location, capacity, quantity_available, base_price, availability_status`,
      [
        resourceId, user.role_name, parsed.data.resourceName ?? null,
        Object.hasOwn(parsed.data, 'description'), parsed.data.description ?? null,
        Object.hasOwn(parsed.data, 'location'), parsed.data.location ?? null,
        Object.hasOwn(parsed.data, 'capacity'), parsed.data.capacity ?? null,
        parsed.data.quantityAvailable ?? null, parsed.data.basePrice ?? null,
        parsed.data.availabilityStatus ?? null, user.user_id,
      ],
    );
    await client.query('COMMIT');
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/resources/[resourceId]', error);
    return NextResponse.json({ error: 'Could not update resource.' }, { status: 500 });
  } finally {
    client.release();
  }
}
