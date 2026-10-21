import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
const actionSchema = z.object({
  action: z.enum(['confirm', 'reject', 'cancel']),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(request: NextRequest, context: { params: { allocationId: string } }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  const allocationId = Number(context.params.allocationId);
  if (!Number.isSafeInteger(allocationId) || allocationId < 1) return NextResponse.json({ error: 'Invalid allocation ID.' }, { status: 400 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose confirm, reject, or cancel.' }, { status: 400 });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reference = await client.query(
        `SELECT a.resource_id FROM resource_allocations a WHERE a.allocation_id = $1`,
        [allocationId],
      );
      if (!reference.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Allocation not found.' }, { status: 404 });
      }
      await client.query('SELECT resource_id FROM resources WHERE resource_id = $1 FOR UPDATE', [reference.rows[0].resource_id]);
      const selected = await client.query(
        `SELECT a.allocation_id, a.event_id, a.resource_id, a.allocation_status, r.owner_id
         FROM resource_allocations a JOIN resources r USING(resource_id)
         WHERE a.allocation_id = $1 FOR UPDATE OF a`,
        [allocationId],
      );
      const allocation = selected.rows[0];
      const eventManager = await canManageEvent(user, Number(allocation.event_id));
      const resourceOwner = Number(allocation.owner_id) === user.user_id;
      if (parsed.data.action === 'confirm' || parsed.data.action === 'reject') {
        if (!(user.role_name === 'ADMIN' || resourceOwner)) {
          await client.query('ROLLBACK');
          return forbiddenResponse();
        }
      } else if (!(user.role_name === 'ADMIN' || eventManager || resourceOwner)) {
        await client.query('ROLLBACK');
        return forbiddenResponse();
      }
      if (allocation.allocation_status !== 'PENDING' && parsed.data.action !== 'cancel') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Only pending requests can be confirmed or rejected.' }, { status: 409 });
      }
      if (allocation.allocation_status === 'CANCELLED' || allocation.allocation_status === 'REJECTED') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'This request is already closed.' }, { status: 409 });
      }

      const status = parsed.data.action === 'confirm' ? 'CONFIRMED' :
        parsed.data.action === 'reject' ? 'REJECTED' : 'CANCELLED';
      const result = await client.query(
        `UPDATE resource_allocations SET allocation_status = $2, cancellation_reason = $3, updated_at = now()
         WHERE allocation_id = $1 RETURNING *`,
        [allocationId, status, parsed.data.reason ?? null],
      );
      await client.query('COMMIT');
      return NextResponse.json({ data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('PATCH /api/allocations/[allocationId]', error);
    return NextResponse.json({ error: 'Could not update the allocation.' }, { status: 500 });
  }
}
