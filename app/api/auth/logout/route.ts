import { NextRequest, NextResponse } from 'next/server';
import { deleteCurrentSession, SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await deleteCurrentSession(request);
    const response = NextResponse.json({ data: { signedOut: true } });
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error('POST /api/auth/logout', error);
    return NextResponse.json({ error: 'Could not sign out.' }, { status: 500 });
  }
}
