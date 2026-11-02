export function authDatabaseError(error: unknown, action: 'register' | 'login') {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';

  if (code === '28P01') {
    return 'PostgreSQL rejected the DATABASE_URL username or password. Update .env.local and restart the app.';
  }
  if (code === '3D000') {
    return 'The database in DATABASE_URL does not exist. Create it, then run db/schema.sql.';
  }
  if (code === '42P01') {
    return 'Authentication tables are missing. Run db/schema.sql against this database, then try again.';
  }
  if (code === 'ECONNREFUSED') {
    return 'Could not connect to PostgreSQL. Start the database and check DATABASE_URL.';
  }
  return action === 'register'
    ? 'Could not create the administrator account. Check the database setup and try again.'
    : 'Could not sign in. Check the database setup and try again.';
}
