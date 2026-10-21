import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return unauthorizedResponse();
    return NextResponse.json({ data: user });
  } catch (error) {
    console.error('GET /api/auth/me', error);
    return NextResponse.json({ error: 'Could not load the signed-in user.' }, { status: 500 });
  }
}
