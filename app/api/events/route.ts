import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createEventSchema } from '@/lib/validation';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorizedResponse();
  try {
    const q = req.nextUrl.searchParams.get('q');
    const result = await pool.query(
      `SELECT event_id, event_name, description, event_type, location, start_datetime, end_datetime,
              expected_attendees,
              CASE WHEN $2::text = 'ADMIN' OR organizer_id = $3 THEN total_budget ELSE NULL END AS total_budget,
              status, created_at
       FROM events
       WHERE ($1::text IS NULL OR event_name ILIKE '%' || $1 || '%' OR event_type ILIKE '%' || $1 || '%')
         AND ($2::text = 'ADMIN' OR organizer_id = $3 OR $2::text IN ('ATTENDEE','STAFF','VENDOR'))
       ORDER BY start_datetime LIMIT 100`,
      [q, user.role_name, user.user_id],
    );
    return NextResponse.json({ data: result.rows });
  } catch (e) { console.error('GET /api/events', e); return NextResponse.json({ error:'Could not load events. Check DATABASE_URL and run db/schema.sql.' }, {status:500}); }
}
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'ORGANIZER'].includes(user.role_name)) return forbiddenResponse();
  const parsed = createEventSchema.safeParse(await req.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error:'Invalid event details.', details:parsed.error.flatten() }, {status:400});
  const d=parsed.data;
  try {
    const result=await pool.query(`INSERT INTO events(organizer_id,event_name,description,event_type,location,start_datetime,end_datetime,expected_attendees,total_budget,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PLANNING') RETURNING *`,[user.user_id,d.eventName,d.description??null,d.eventType,d.location??null,d.startDatetime,d.endDatetime,d.expectedAttendees,d.totalBudget]);
    return NextResponse.json({data:result.rows[0]}, {status:201});
  } catch(e) { console.error('POST /api/events',e); return NextResponse.json({error:'Could not create event.'},{status:400}); }
}
