import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

const resourceSchema = z.object({
  resourceName: z.string().trim().min(2).max(180),
  typeName: z.enum(['Venue', 'Equipment', 'Staff', 'Service']),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  quantityAvailable: z.coerce.number().int().positive().max(10000).default(1),
  basePrice: z.coerce.number().min(0).max(1000000000).default(0),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const params = request.nextUrl.searchParams;
  const query = params.get('q')?.trim() || null;
  const type = params.get('type') || null;
  const minCapacity = params.get('minCapacity');
  const maxPrice = params.get('maxPrice');
  const availableStart = params.get('availableStart');
  const availableEnd = params.get('availableEnd');
  const quantity = Number(params.get('quantity') || 1);

  if (type && !['Venue', 'Equipment', 'Staff', 'Service'].includes(type)) {
    return NextResponse.json({ error: 'Unknown resource category.' }, { status: 400 });
  }
  if ((availableStart && !availableEnd) || (availableEnd && !availableStart)) {
    return NextResponse.json({ error: 'Provide both availability start and end times.' }, { status: 400 });
  }
  if (availableStart && (Number.isNaN(Date.parse(availableStart)) || Number.isNaN(Date.parse(availableEnd!)) || Date.parse(availableEnd!) <= Date.parse(availableStart))) {
    return NextResponse.json({ error: 'Invalid availability time range.' }, { status: 400 });
  }
  const capacity = minCapacity === null ? null : Number(minCapacity);
  const price = maxPrice === null ? null : Number(maxPrice);
  if ((capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) ||
      (price !== null && (!Number.isFinite(price) || price < 0)) ||
      !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'Invalid capacity, price, or quantity filter.' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `SELECT r.resource_id, r.owner_id, r.resource_name, r.description, r.location, r.capacity,
              r.quantity_available, r.base_price, r.availability_status, t.type_name
       FROM resources r JOIN resource_types t USING(resource_type_id)
       WHERE r.availability_status = 'ACTIVE'
         AND ($1::text IS NULL OR r.resource_name ILIKE '%' || $1 || '%' OR COALESCE(r.description,'') ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR t.type_name = $2)
         AND ($3::int IS NULL OR r.capacity >= $3)
         AND ($4::numeric IS NULL OR r.base_price <= $4)
         AND ($5::timestamptz IS NULL OR (
           NOT EXISTS (
             SELECT 1 FROM resource_availability a
             WHERE a.resource_id = r.resource_id AND a.availability_status = 'UNAVAILABLE'
               AND tstzrange(a.start_datetime, a.end_datetime, '[)') && tstzrange($5, $6, '[)')
           )
           AND r.quantity_available - COALESCE((
             SELECT MAX(used) FROM (
               SELECT SUM(delta) OVER (ORDER BY point, delta) AS used
               FROM (
                 SELECT GREATEST(ra.start_datetime, $5::timestamptz) AS point, ra.quantity AS delta
                 FROM resource_allocations ra
                 WHERE ra.resource_id = r.resource_id AND ra.allocation_status IN ('PENDING','CONFIRMED')
                   AND tstzrange(ra.start_datetime, ra.end_datetime, '[)') && tstzrange($5, $6, '[)')
                 UNION ALL
                 SELECT LEAST(ra.end_datetime, $6::timestamptz) AS point, -ra.quantity AS delta
                 FROM resource_allocations ra
                 WHERE ra.resource_id = r.resource_id AND ra.allocation_status IN ('PENDING','CONFIRMED')
                   AND tstzrange(ra.start_datetime, ra.end_datetime, '[)') && tstzrange($5, $6, '[)')
               ) boundaries
             ) usage
           ), 0) >= $7
         ))
       ORDER BY t.type_name, r.resource_name LIMIT 200`,
      [query, type, capacity, price, availableStart, availableEnd, quantity],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('GET /api/resources', error);
    return NextResponse.json({ error: 'Could not load resources. Check database setup.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'VENDOR'].includes(user.role_name)) return forbiddenResponse();
  const parsed = resourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid resource details.', details: parsed.error.flatten() }, { status: 400 });

  try {
    const vendor = user.role_name === 'VENDOR'
      ? await pool.query('SELECT vendor_id FROM vendor_profiles WHERE user_id = $1', [user.user_id])
      : null;
    if (vendor && !vendor.rowCount) return NextResponse.json({ error: 'No vendor profile is linked to your account.' }, { status: 403 });
    const result = await pool.query(
      `INSERT INTO resources(owner_id, resource_type_id, resource_name, description, location, capacity, quantity_available, base_price)
       VALUES($1, (SELECT resource_type_id FROM resource_types WHERE type_name = $2), $3, $4, $5, $6, $7, $8)
       RETURNING resource_id, resource_name, description, location, capacity, quantity_available, base_price, availability_status`,
      [
        user.role_name === 'VENDOR' ? user.user_id : null, parsed.data.typeName, parsed.data.resourceName,
        parsed.data.description ?? null, parsed.data.location ?? null, parsed.data.capacity ?? null,
        parsed.data.quantityAvailable, parsed.data.basePrice,
      ],
    );
    return NextResponse.json({ data: { ...result.rows[0], type_name: parsed.data.typeName } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/resources', error);
    return NextResponse.json({ error: 'Could not create resource.' }, { status: 500 });
  }
}
