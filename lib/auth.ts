import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/constants';

export { SESSION_COOKIE } from '@/lib/constants';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export type AppUser = {
  user_id: number;
  full_name: string;
  email: string;
  role_name: 'ADMIN' | 'ORGANIZER' | 'VENDOR' | 'STAFF' | 'ATTENDEE';
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number, response: NextResponse) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
  await pool.query(
    'INSERT INTO app_sessions(user_id, token_hash, expires_at) VALUES($1, $2, $3)',
    [userId, hashToken(token), expiresAt],
  );
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export async function getCurrentUser(request?: NextRequest): Promise<AppUser | null> {
  const token = request ? request.cookies.get(SESSION_COOKIE)?.value : cookies().get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  const result = await pool.query<AppUser>(
    `SELECT u.user_id, u.full_name, u.email, r.role_name
     FROM app_sessions s
     JOIN users u ON u.user_id = s.user_id
     JOIN roles r ON r.role_id = u.role_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'ACTIVE'
     LIMIT 1`,
    [hashToken(token)],
  );
  const user = result.rows[0];
  if (!user) return null;
  const userId = Number(user.user_id);
  if (!Number.isSafeInteger(userId)) throw new Error('Application user ID exceeds the supported integer range.');
  return { ...user, user_id: userId };
}

export async function deleteCurrentSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 });
}

export async function canManageEvent(user: AppUser, eventId: number) {
  if (user.role_name === 'ADMIN') return true;
  if (user.role_name !== 'ORGANIZER') return false;
  const result = await pool.query(
    'SELECT 1 FROM events WHERE event_id = $1 AND organizer_id = $2',
    [eventId, user.user_id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function requireUser(request: NextRequest, roles?: AppUser['role_name'][]) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, response: unauthorizedResponse() };
  if (roles && !roles.includes(user.role_name)) return { user: null, response: forbiddenResponse() };
  return { user, response: null };
}
