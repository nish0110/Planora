# Planora — Intelligent Event Planning & Resource Coordination

Planora is a Next.js + PostgreSQL DBMS Level 3 project prototype for managing events, resources, allocations, schedules, vendors, registrations, tasks, budgets, and expenses.

## MVP status

Included in this repository:
- Responsive Planora workspace UI (overview, events, resources, budget/report screens).
- PostgreSQL schema with primary/foreign keys, check constraints, uniqueness, indexes, and a single-capacity resource overlap exclusion constraint.
- Event list/search/create API connected to PostgreSQL.
- Resource catalogue API.
- Resource allocation API with a transaction, resource row lock, availability checks, and conflict responses.
- Audit trigger for resource allocations and expenses; event overview view; financial summary function.
- Request validation tests.

The overview/resource/budget pages currently use illustrative sample figures; the Events page and APIs connect to PostgreSQL. Authentication/authorization UI, edit/delete flows, complete resource CRUD, and a production-ready multi-unit capacity allocator remain to be implemented before calling this a fully production-ready system. This distinction is deliberate: do not present mock dashboard figures as live data.

## Stack
- Next.js 16 / React 19 / TypeScript
- PostgreSQL
- `pg` connection pool
- Zod request validation
- Tailwind-free custom CSS for the prototype UI
- Vitest for validation tests

## Prerequisites
- Node.js 22.12 or later (or 24 or later)
- PostgreSQL 14 or later
- npm

## Local setup

1. Create a PostgreSQL database named `planora`.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` for your local database.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create tables, constraints, triggers, views, and functions:

   ```bash
   npm run db:setup
   ```

   `db:setup` expects `DATABASE_URL` to be available in your shell environment. If your shell does not load `.env.local` for scripts, run:

   ```bash
   psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/planora" -f db/schema.sql
   psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/planora" -f db/seed.sql
   ```

5. Seed local demo records (optional):

   ```bash
   psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/planora" -f db/seed.sql
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

> Seed users have disabled placeholder passwords. Authentication is not implemented in this MVP; do not expose it as a public production service.

## API endpoints

- `GET /api/events?q=design` — list/search events.
- `POST /api/events` — create an event. Required fields: `organizerId`, `eventName`, `eventType`, `startDatetime`, `endDatetime`; optional: `description`, `location`, `expectedAttendees`, `totalBudget`.
- `GET /api/resources?q=venue&type=Venue` — search active resources.
- `GET /api/allocations?eventId=1` — list allocations.
- `POST /api/allocations` — create an allocation. Required fields: `eventId`, `resourceId`, `allocatedBy`, `startDatetime`, `endDatetime`; optional: `quantity`, `totalCost`.

All date-times passed to the APIs must be ISO 8601 strings with timezone information. Protected endpoints must be secured with authentication/authorization before deployment.

## Advanced DBMS concepts demonstrated

1. **Transactions:** resource allocation is attempted in a transaction and rolled back on failure.
2. **Triggers:** audit changes to allocations and expenses.
3. **Function:** `get_event_financial_summary(event_id)`.
4. **View:** `event_overview`.
5. **Indexes:** event, allocation, task, expense, and service query indexes.
6. **Constraints:** foreign keys, check constraints, unique registrations, and overlapping allocation prevention for quantity-one resources.

Example SQL demonstrations:

```sql
SELECT * FROM event_overview ORDER BY start_datetime;
SELECT * FROM get_event_financial_summary(1);
SELECT table_name, record_id, action, changed_at FROM audit_log ORDER BY changed_at DESC;
EXPLAIN ANALYZE SELECT * FROM events WHERE status = 'PLANNING' ORDER BY start_datetime;
```

## Tests

```bash
npm test
```

The tests cover request validation. After the database is configured, add integration tests for duplicate registrations, concurrent booking attempts, authorization, capacity checks, and rollback behavior.

## Suggested next development milestones

1. Add authentication and server-side role checks.
2. Build resource create/edit forms and wire the resource page to `/api/resources`.
3. Add event details, schedules, tasks, registrations, and expense endpoints/UI.
4. Add integration tests for resource allocation, including two concurrent conflicting requests.
5. Add multi-unit resource capacity accounting; the current exclusion constraint is intended for resources allocated as one indivisible unit.
6. Optionally add pgvector-backed semantic venue/vendor search after the core workflow is stable.
7. Complete project report, ER diagram, screenshots, and individual contribution notes.

## Security notes

- Never commit `.env.local` or real credentials.
- Use hashed passwords through a reviewed authentication library when authentication is added.
- Add role-based authorization to all write APIs before deployment.
- Configure TLS and restrictive database permissions in hosted environments.
- Treat this as a coursework MVP, not a production-ready booking service.
