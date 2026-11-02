import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { assertSuccessfulJsonResponse } from '@/lib/api-response';
import { authDatabaseError } from '@/lib/auth-errors';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  createSession: vi.fn(),
}));

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validRegistration = {
  fullName: 'Alex Morgan',
  email: 'alex@example.com',
  password: 'Planora2026',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('auth database error messages', () => {
  it('explains incorrect PostgreSQL credentials without exposing secrets', () => {
    const error = Object.assign(new Error('authentication failed'), { code: '28P01' });
    expect(authDatabaseError(error, 'register')).toContain('DATABASE_URL username or password');
  });

  it('explains a missing database schema', () => {
    const error = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    expect(authDatabaseError(error, 'login')).toContain('Run db/schema.sql');
  });
});

describe('POST /api/auth/register database connection failures', () => {
  it('returns a useful JSON response when PostgreSQL rejects the connection', async () => {
    vi.mocked(pool.connect).mockRejectedValueOnce(
      Object.assign(new Error('authentication failed'), { code: '28P01' }),
    );

    const response = await register(request('/api/auth/register', validRegistration));

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'PostgreSQL rejected the DATABASE_URL username or password. Update .env.local and restart the app.',
    });
  });
});

describe('POST /api/auth/login database failures', () => {
  it('returns a useful JSON response when PostgreSQL rejects the login query', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(
      Object.assign(new Error('authentication failed'), { code: '28P01' }),
    );

    const response = await login(request('/api/auth/login', {
      email: validRegistration.email,
      password: validRegistration.password,
    }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('DATABASE_URL username or password');
  });
});

describe('JSON response parsing for auth forms', () => {
  it('shows a useful error when the server returns an empty response', async () => {
    await expect(assertSuccessfulJsonResponse(new Response('', { status: 500 }), 'Signup failed'))
      .rejects.toThrow('empty response (HTTP 500)');
  });

  it('shows a useful error when the server returns HTML instead of JSON', async () => {
    await expect(assertSuccessfulJsonResponse(new Response('<html>error</html>', { status: 500 }), 'Signup failed'))
      .rejects.toThrow('invalid response (HTTP 500)');
  });

  it('displays the error message from a JSON API response', async () => {
    await expect(assertSuccessfulJsonResponse(
      Response.json({ error: 'Email or password is incorrect.' }, { status: 401 }),
      'Sign in failed',
    )).rejects.toThrow('Email or password is incorrect.');
  });
});
