import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams.get('q'); const type=req.nextUrl.searchParams.get('type');
 try { const r=await pool.query(`SELECT r.resource_id,r.resource_name,r.description,r.location,r.capacity,r.quantity_available,r.base_price,r.availability_status,t.type_name FROM resources r JOIN resource_types t USING(resource_type_id) WHERE r.availability_status='ACTIVE' AND ($1::text IS NULL OR r.resource_name ILIKE '%'||$1||'%' OR COALESCE(r.description,'') ILIKE '%'||$1||'%') AND ($2::text IS NULL OR t.type_name=$2) ORDER BY t.type_name,r.resource_name LIMIT 200`,[q,type]); return NextResponse.json({data:r.rows}); }
 catch(e){console.error('GET /api/resources',e);return NextResponse.json({error:'Could not load resources. Check database setup.'},{status:500});}
}
