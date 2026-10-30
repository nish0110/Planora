# Planora — Event Planning & Resource Coordination

Planora is a coursework/local-use event coordination app built with Next.js, TypeScript, and PostgreSQL. It includes role-based accounts, events, resource and vendor bookings, schedules, tasks, attendee registrations, expenses, and budget reporting.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

## Local setup

1. Create a PostgreSQL database named `planora`, and configure `.env.local`:

   ```env
   DATABASE_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/planora
   PGSSL=false
   ```

   Keep `.env.local` private; it is ignored by Git. For a database on a teammate's machine, use its reachable host address, not `localhost`, and configure PostgreSQL/network access securely.

2. From the project directory, install dependencies:

   ```bash
   npm install
   ```

3. Apply the schema as a database role that owns the Planora tables and can install `btree_gist`:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
   ```

   In Ubuntu/WSL, export the connection string in that terminal first:

   ```bash
   export DATABASE_URL='postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_DB_HOST:5432/planora'
   ```

   Do not run schema setup concurrently from multiple teammates. It is idempotent for a single project database, but use a migration/backup plan for shared or important data.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`. The first administrator is configured once at `/register`. If the demo seed has been loaded, this setup replaces the disabled `admin@planora.local` placeholder account with the details you enter. The administrator can create organizer, vendor, staff, and attendee accounts from **Team & access**.

## Features

- **Authentication and roles:** bcrypt password hashes, database-backed seven-day sessions, HTTP-only same-site cookies, logout, suspended-account revocation, and server-side role checks. Only the first account can use initial admin setup; later accounts are created by an administrator.
- **Events:** live dashboard and event list, search, creation, detail view, editing, and cancellation. Cancelling an event cancels its pending/confirmed resource and service bookings.
- **Resource catalogue:** resource creation/editing, category/search/capacity/price/date filters, availability windows, and reservation requests.
- **Allocation safety:** transaction-locked inventory, date and venue-capacity validation, pending/confirmed quantity accounting, database trigger capacity enforcement, conflict feedback, and alternative resource suggestions. Owners/admins can confirm or reject requests; event organizers can cancel their reservations.
- **Event operations:** schedules, assigned tasks with priorities/deadlines/status, attendee self-registration and waitlisting, vendor services and bookings, expenses and voiding, and budget/export reporting.
- **Administration:** create users by role, suspend/reactivate accounts, and review vendor verification.

## Role overview

| Role | Capabilities |
| --- | --- |
| Admin | Manage the workspace, all events/resources/bookings, team accounts, and vendor verification |
| Organizer | Manage owned events and their schedules, tasks, attendees, expenses, and bookings |
| Vendor | Manage owned resources/services and review bookings for owned resources/services |
| Staff | View events and update tasks assigned to them |
| Attendee | View events, self-register, and cancel their own registrations |

The PostgreSQL login role is separate from the Planora application role. Database roles such as `person1`/`person2` control database access; Planora roles (`ADMIN`, `ORGANIZER`, etc.) are rows in the app's `roles` and `users` tables.

## Validation

```bash
npm test
npm run build
```

Tests cover request validation. End-to-end database and concurrency scenarios should be run against a disposable PostgreSQL database before a coursework demo or shared deployment.

## Important limitations

This implementation is for coursework/local use, not a hardened public production deployment. Before exposing it to the internet, add TLS and network/database hardening, security review, login throttling, password reset/change and recovery flows, operational backups/monitoring, and integration tests against the intended hosting setup. Share temporary credentials securely and ask users to change them through a future password-change workflow.

Never commit `.env.local`, database credentials, or other secrets.
