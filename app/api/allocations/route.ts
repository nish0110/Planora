import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createAllocationSchema } from '@/lib/validation';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const eventId=req.nextUrl.searchParams.get('eventId');
 try { const r=await pool.query(`SELECT a.*,e.event_name,r.resource_name,t.type_name FROM resource_allocations a JOIN events e USING(event_id) JOIN resources r USING(resource_id) JOIN resource_types t USING(resource_type_id) WHERE ($1::bigint IS NULL OR a.event_id=$1) ORDER BY a.start_datetime DESC LIMIT 200`,[eventId]);return NextResponse.json({data:r.rows}); }
 catch(e){console.error('GET /api/allocations',e);return NextResponse.json({error:'Could not load allocations.'},{status:500});}
}
export async function POST(req:NextRequest){
 const parsed=createAllocationSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid allocation details.',details:parsed.error.flatten()},{status:400});
 const d=parsed.data; const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const resource=await client.query(`SELECT resource_id,capacity,quantity_available,base_price,availability_status FROM resources WHERE resource_id=$1 FOR UPDATE`,[d.resourceId]);
  if(!resource.rowCount || resource.rows[0].availability_status!=='ACTIVE') {await client.query('ROLLBACK');return NextResponse.json({error:'Resource not found or inactive.'},{status:404});}
  const event=await client.query(`SELECT event_id,expected_attendees,total_budget FROM events WHERE event_id=$1 FOR UPDATE`,[d.eventId]);
  if(!event.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Event not found.'},{status:404});}
  if(resource.rows[0].capacity!==null && Number(resource.rows[0].capacity)<Number(event.rows[0].expected_attendees)){await client.query('ROLLBACK');return NextResponse.json({error:'Resource capacity is below expected attendance.'},{status:409});}
  const blocked=await client.query(`SELECT 1 FROM resource_availability WHERE resource_id=$1 AND availability_status='UNAVAILABLE' AND tstzrange(start_datetime,end_datetime,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1`,[d.resourceId,d.startDatetime,d.endDatetime]);
  if(blocked.rowCount){await client.query('ROLLBACK');return NextResponse.json({error:'Resource is marked unavailable during that period.'},{status:409});}
  const r=await client.query(`INSERT INTO resource_allocations(event_id,resource_id,allocated_by,start_datetime,end_datetime,quantity,allocation_status,total_cost) VALUES($1,$2,$3,$4,$5,$6,'CONFIRMED',$7) RETURNING *`,[d.eventId,d.resourceId,d.allocatedBy,d.startDatetime,d.endDatetime,d.quantity,d.totalCost]);
  await client.query('COMMIT');return NextResponse.json({data:r.rows[0]}, {status:201});
 }catch(e:any){await client.query('ROLLBACK');if(e?.code==='23P01')return NextResponse.json({error:'Booking conflict: this resource is already allocated for an overlapping time.'},{status:409});if(e?.code==='23503')return NextResponse.json({error:'Invalid event, resource, or user ID.'},{status:400});console.error('POST /api/allocations',e);return NextResponse.json({error:'Could not allocate resource.'},{status:500});}
 finally{client.release();}
}
