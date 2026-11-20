# Planora — Event Planning and Resource Coordination

## Project report

**Technology:** Next.js 14, React 18, TypeScript, PostgreSQL, MongoDB  
**Project category:** Coursework/local-use web application  
**Report basis:** Current repository implementation, reviewed 16 November 2026

## 1. Abstract

Planora is a web application for coordinating events and the resources and services they need. It combines a PostgreSQL-backed workspace for event records, resource availability and allocations, vendor services, schedules, tasks, registrations, expenses, and financial summaries with MongoDB documents for imported vendor catalog descriptions and optional event metadata/attachment references. The user interface is implemented with Next.js and React; Next.js Route Handlers validate requests, enforce application-level permissions, and write to the appropriate database.

PostgreSQL remains the source of truth for users, events, prices, inventory, availability, bookings, and expenses. MongoDB references vendor and event IDs without copying those records. The relational schema uses primary and foreign keys, `CHECK`, `UNIQUE`, and exclusion constraints, transactions, triggers, indexes, a view, and a database function; MongoDB adds flexible document shapes and unique indexes. Authentication uses password hashes and PostgreSQL-backed sessions. The project is intended for coursework and local demonstration; it is not presented as a production-hardened service.

## 2. Problem statement and motivation

Event planning requires coordinating dates, venues, equipment, vendors, staff, attendees, and budgets. Spreadsheets and disconnected messages can lead to conflicting bookings, missed requirements, capacity errors, and limited visibility into costs.

Planora addresses this coordination problem by keeping operational records in PostgreSQL and providing workflows for creating events, searching for resources, requesting allocations, managing event operations, and reviewing financial totals. Optional imported descriptions and less-structured event notes are stored in MongoDB. Database constraints and transactional checks protect shared inventory from conflicting or excessive allocations; the two databases are not used as duplicate sources of truth.

## 3. Objectives and scope

### Objectives

- Maintain consistent relational records for events, users, resources, bookings, and expenses.
- Prevent resource allocations from exceeding available inventory during overlapping time periods.
- Support event requirements, schedules, assigned tasks, registrations, vendor services, and expenses.
- Store imported vendor catalog descriptions and optional event metadata/attachment references as noncritical MongoDB documents.
- Keep prices, budgets, availability, inventory quantities, bookings, accounts, and core event records exclusively authoritative in PostgreSQL.
- Demonstrate transactions, triggers, functions, views, indexes, and database constraints.
- Provide a responsive web interface backed by typed API handlers.
- Enforce account status and application roles on server-side operations.

### Scope

The current application includes account registration/login/logout, role-based workspace access, event management, resource and service catalogues, resource and service bookings, availability periods, event schedules and tasks, attendee registration, expense tracking, team management, vendor verification, and budget reporting/export. MongoDB adds administrator/vendor workflows for importing descriptive vendor catalog records and event-manager workflows for flexible event notes and HTTPS attachment references. Its pages include the dashboard, events, event detail, resources, bookings, services, imported vendor catalog, budget, team, login, and registration.

The project does not include verified production deployment, end-to-end testing against a production-like database, password recovery/change, login throttling, operational backup/monitoring, or a full deployment security review.

## 4. Functional requirements and user roles

### Functional requirements

1. Register the initial administrator and authenticate users.
2. Create and manage events, including event dates, expected attendance, status, and budget.
3. Search and manage resources and their availability.
4. Create, review, confirm, reject, or cancel resource allocations according to the user's role and ownership.
5. Manage vendor services and event service bookings.
6. Maintain event schedules, assigned tasks, and attendee registrations.
7. Record or void expenses and view event financial summaries.
8. Allow administrators to manage user accounts and review vendor verification.
9. Reject malformed or unauthorized requests and return explicit API error responses.

### Application roles

| Role | Main capabilities |
|---|---|
| `ADMIN` | Workspace administration, all events/resources/bookings, team accounts, and vendor verification |
| `ORGANIZER` | Manage owned events and their schedules, tasks, registrations, expenses, and bookings |
| `VENDOR` | Manage owned resources/services and review bookings for those resources/services |
| `STAFF` | View events and update tasks assigned to them |
| `ATTENDEE` | View events, register, and cancel their own registrations |

These are application roles stored in `roles` and assigned to `users`. They are distinct from PostgreSQL login roles, which control database access.

## 5. System architecture

```text
Browser
  │
  ▼
Next.js App Router UI (React + TypeScript)
  │ HTTP requests
  ▼
Next.js Route Handlers (/api/...)
  │ Zod validation, authentication/authorization
  ├─────────────────────────────────────┐
  ▼                                     ▼
PostgreSQL (pg)                    MongoDB (mongodb)
  │                                     │
  ├── users, events, resources,         ├── vendor_catalog_items
  │   prices, availability, bookings,   └── event_metadata
  │   schedules, tasks, expenses
  ├── transactions, constraints,
  │   triggers, view, SQL function
  └── source of truth for operations
```

The UI pages are in `app/`; API endpoints are implemented as Next.js Route Handlers under `app/api/`. Shared PostgreSQL, MongoDB, authentication, and input-validation logic is in `lib/`. The `pg` pool is configured in `lib/db.ts`, and the MongoDB client/unique indexes are initialized lazily by `lib/mongo.ts`. The API uses parameterized SQL and validates document payloads before writes.

Resource allocation creation is a PostgreSQL transaction: it locks and checks the relevant records, validates the requested period and event/resource conditions, inserts the pending allocation, and commits. PostgreSQL's trigger rechecks inventory capacity under a resource row lock, providing a database-level guard even when requests are concurrent. MongoDB documents reference PostgreSQL vendor/event IDs; the API verifies those relationships and never copies prices, stock, availability, or booking state. No distributed transaction is required because the document features are optional and noncritical.

## 6. ER diagram and relational schema

### Relationship diagram

```mermaid
erDiagram
    ROLES ||--o{ USERS : assigns
    USERS ||--o{ EVENTS : organizes
    RESOURCE_TYPES ||--o{ RESOURCES : classifies
    EVENTS ||--o{ EVENT_RESOURCE_REQUIREMENTS : specifies
    RESOURCE_TYPES ||--o{ EVENT_RESOURCE_REQUIREMENTS : requested_type
    RESOURCES ||--o{ RESOURCE_AVAILABILITY : has_periods
    EVENTS ||--o{ RESOURCE_ALLOCATIONS : receives
    RESOURCES ||--o{ RESOURCE_ALLOCATIONS : allocated_as
    USERS ||--o{ RESOURCE_ALLOCATIONS : requests
    USERS ||--o| VENDOR_PROFILES : has
    VENDOR_PROFILES ||--o{ SERVICES : offers
    EVENTS ||--o{ EVENT_SERVICE_BOOKINGS : books
    SERVICES ||--o{ EVENT_SERVICE_BOOKINGS : booked_as
    EVENTS ||--o{ EVENT_SCHEDULES : contains
    EVENTS ||--o{ EVENT_TASKS : contains
    USERS o|--o{ EVENT_TASKS : assigned
    EVENTS ||--o{ EVENT_REGISTRATIONS : has
    USERS ||--o{ EVENT_REGISTRATIONS : registers
    EVENTS ||--o| EVENT_BUDGETS : budget_record
    EVENTS ||--o{ EXPENSES : incurs
    USERS ||--o{ EXPENSES : records
    EVENTS ||--o{ FEEDBACK : receives
    USERS ||--o{ FEEDBACK : submits
    USERS ||--o{ APP_SESSIONS : authenticates
```

`resource_allocations` and `event_service_bookings` are separate relationships because physical inventory and vendor-delivered services have different allocation and conflict rules. `event_overview` is a view, and `audit_log` stores trigger-generated history; neither is an entity relationship with ordinary cascading ownership.

MongoDB documents are not relational entities and do not appear in the ER diagram. `vendor_catalog_items` has a `vendorId` reference to `vendor_profiles.vendor_id`; `event_metadata` has an `eventId` reference to `events.event_id`. These cross-database references are checked by the API and are not foreign keys.

### Relational schema

| Table | Purpose and principal links |
|---|---|
| `roles` | Allowed application role names. Referenced by `users`. |
| `users` | User identity, password hash, role, and active/suspended status. |
| `app_sessions` | Hashed session tokens and expiry; references `users`. |
| `events` | Event details, organizer, dates, attendance target, budget, and status. |
| `resource_types` | Resource categories referenced by resources and event requirements. |
| `resources` | Inventory, ownership, type, capacity, quantity, price, and status. |
| `resource_availability` | Resource-specific available/unavailable date periods. |
| `event_resource_requirements` | Resource-type and quantity needs for an event. |
| `resource_allocations` | Requested/confirmed resource quantities and periods per event. |
| `vendor_profiles` | Vendor business details and verification status; one per user. |
| `services` | Services offered by a vendor profile. |
| `event_service_bookings` | Event booking, price quote, period, and status for a service. |
| `event_schedules` | Timed activities associated with an event. |
| `event_tasks` | Event tasks, priority, deadline, status, and optional assignee. |
| `event_registrations` | Attendee registration state and check-in time. |
| `event_budgets` | Optional one-to-one event budget record. Event totals also exist on `events`. |
| `expenses` | Event expenses, recorder, date, and recorded/voided status. |
| `feedback` | Per-user event rating and comments. |
| `audit_log` | Old/new JSONB row snapshots for audited allocation and expense changes. |

## 7. Database selection and justification

PostgreSQL was selected as the application's relational database because the domain has strongly related entities and benefits from foreign keys and transactional updates. PostgreSQL also supplies features used directly by the project: `NUMERIC` for currency values, `TIMESTAMPTZ` for event periods, JSONB audit snapshots, PL/pgSQL triggers, SQL functions and views, and GiST exclusion constraints for overlapping service bookings. The `btree_gist` extension supports the service exclusion constraint.

MongoDB is used only for the two document-oriented needs: imported catalog descriptions with flexible attributes, and optional per-event metadata with attachment references. The application connects through the official Node.js MongoDB driver and creates unique indexes for document identity. MongoDB is not used for records that need relational integrity or conflict-safe transactions.

The application connects to PostgreSQL through the Node.js `pg` library and a bounded connection pool. PostgreSQL's mature constraint and transaction support is particularly useful for shared booking data where application-level checks alone would not be a sufficient integrity boundary. Keeping one authoritative store per type of information avoids synchronization drift and cross-database transaction requirements.

## 8. Data dictionary

The following summarizes the schema's principal attributes. Primary keys use `BIGSERIAL` unless stated otherwise; foreign keys are shown by the referenced table. The executable definitions and complete nullability/default details are authoritative in `db/schema.sql`.

| Table | Principal attributes |
|---|---|
| `roles` | `role_id` (PK), `role_name` (unique, restricted to the five supported roles) |
| `users` | `user_id` (PK), `role_id` (FK), `full_name`, `email` (unique), `password_hash`, `phone`, `status`, `created_at` |
| `app_sessions` | `session_id` (PK), `user_id` (FK), `token_hash` (unique), `expires_at`, `created_at` |
| `events` | `event_id` (PK), `organizer_id` (FK), `event_name`, `description`, `event_type`, `location`, `start_datetime`, `end_datetime`, `expected_attendees`, `total_budget`, `status`, timestamps |
| `resource_types` | `resource_type_id` (PK), `type_name` (unique), `description` |
| `resources` | `resource_id` (PK), `owner_id` (FK, nullable), `resource_type_id` (FK), name/description/location, `capacity`, `quantity_available`, `base_price`, `availability_status`, `created_at` |
| `resource_availability` | `availability_id` (PK), `resource_id` (FK), `start_datetime`, `end_datetime`, `availability_status`, `reason` |
| `event_resource_requirements` | `requirement_id` (PK), `event_id` and `resource_type_id` (FKs), `quantity_required`, `min_capacity`, `max_budget`, notes, `status` |
| `resource_allocations` | `allocation_id` (PK), `event_id`, `resource_id`, `allocated_by` (FKs), period, `quantity`, `allocation_status`, `total_cost`, cancellation reason, timestamps |
| `vendor_profiles` | `vendor_id` (PK), `user_id` (unique FK), `business_name`, `business_category`, `rating`, `verification_status` |
| `services` | `service_id` (PK), `vendor_id` (FK), `service_name`, description, `price`, `duration_minutes`, `service_status` |
| `event_service_bookings` | `booking_id` (PK), `event_id` and `service_id` (FKs), period, `quoted_price`, `booking_status`, `created_at` |
| `event_schedules` | `schedule_id` (PK), `event_id` (FK), activity name/description, period, location, `status` |
| `event_tasks` | `task_id` (PK), `event_id` (FK), optional `assigned_to` (FK), task name/description, `priority`, `deadline`, `status`, `created_at` |
| `event_registrations` | `registration_id` (PK), `event_id` and `attendee_id` (FKs), `registration_date`, `registration_status`, `check_in_time` |
| `event_budgets` | `budget_id` (PK), `event_id` (unique FK), `total_budget`, `last_updated` |
| `expenses` | `expense_id` (PK), `event_id` and `recorded_by` (FKs), `category`, `description`, `amount`, `expense_date`, `status` |
| `feedback` | `feedback_id` (PK), `event_id` and `user_id` (FKs), `rating`, `comments`, `submitted_at` |
| `audit_log` | `audit_id` (PK), `table_name`, `record_id`, `action`, `changed_at`, optional `changed_by`, `old_data`/`new_data` JSONB |

`event_overview` exposes event and organizer summary values, including registration count and confirmed allocation count. `get_event_financial_summary(event_id)` returns planned budget, confirmed allocation/service costs, recorded expenses, and remaining budget.

### MongoDB document dictionary

| Collection | Document identity | Stored fields | Explicitly excluded |
|---|---|---|---|
| `vendor_catalog_items` | Unique `(vendorId, source, externalId)`; `vendorId` references a PostgreSQL vendor profile | `title`, descriptive text, `category`, optional HTTPS `sourceUrl`, `tags`, nontransactional `attributes`, `createdAt`, `importedAt` | Price, cost, currency, availability, quantities, inventory, bookings, and budgets |
| `event_metadata` | Unique `eventId`, referencing a PostgreSQL event | Flexible `metadata`, up to 25 HTTPS attachment references (`name`, `url`, `description`), `createdAt`, `updatedAt` | Event identity/details, users, schedules, budgets, availability, and booking state |

Flexible objects are limited to 16 KB and reject structured keys associated with transactional data. Attachment records are references only; file bytes are not uploaded or stored by this feature.

## 9. Constraints and integrity rules

- Primary keys identify rows; foreign keys maintain relationships between users, events, resources, bookings, and related records.
- `users.email`, `roles.role_name`, resource type names, `vendor_profiles.user_id`, and `event_budgets.event_id` are unique where appropriate.
- Registrations and feedback use `UNIQUE(event_id, attendee_id)` and `UNIQUE(event_id, user_id)` to prevent duplicate per-event records.
- `CHECK` constraints restrict statuses and role names to allowed values; ratings, quantities, capacities, attendee counts, and monetary values are range-checked.
- Event, availability, allocation, service-booking, and schedule periods require the end to be later than the start.
- A partial GiST exclusion constraint prevents overlapping pending/confirmed bookings of the same vendor service.
- The resource-allocation trigger locks the resource row and rejects overlapping pending/confirmed quantities above `quantity_available`.
- API-level validation checks request shapes and date ordering before database writes; database constraints remain the final integrity check.
- Cascading deletes are used selectively for dependent records such as sessions, schedules, registrations, and vendor-owned services; other relationships intentionally restrict deletion or set optional references to `NULL`.
- MongoDB collection indexes enforce document identity. The API validates the referenced PostgreSQL vendor/event and access rights before writes; these references are not cross-database foreign keys and do not provide distributed transactions.
- MongoDB document schemas are constrained at the API boundary: HTTPS URLs only, bounded attachment count/document size, and rejection of nested price, inventory, availability, booking, and budget fields.

## 10. Advanced database concepts

### Transactions and concurrency

Resource allocation creation uses a PostgreSQL transaction (`BEGIN`, checks and writes, then `COMMIT`; failures use `ROLLBACK`). The resource row lock serializes competing writes for the same inventory. This approach and the trigger are intended to prevent two simultaneous requests from consuming the same remaining capacity.

### Triggers and functions

- `enforce_resource_allocation_capacity()` is a PL/pgSQL trigger function. A `BEFORE INSERT OR UPDATE` trigger runs it for allocation changes and raises an error if the resource's available quantity would be exceeded.
- `audit_row_change()` writes old/new JSONB values to `audit_log`. It is attached to insert, update, and delete operations on `resource_allocations` and `expenses`.
- `get_event_financial_summary(p_event_id)` is a SQL table-returning function that combines the event budget with confirmed resource allocations, confirmed service bookings, and recorded expenses.

### View and indexes

- `event_overview` joins events and organizers and derives registration and confirmed-allocation counts.
- Indexes support common lookups by organizer/date, event status/date, resource type/status, allocation event/status and resource/period, task event/status/deadline, expense event/date, service vendor/status, registration event/status, and session user/expiry.
- The recorded-expense index is partial, filtering to `status = 'RECORDED'`.
- MongoDB uses a unique compound index on `(vendorId, source, externalId)` for idempotent imports and a unique index on `eventId` for one metadata document per event.

## 11. API design

Endpoints are implemented as Next.js Route Handlers. JSON success responses generally use a `{ "data": ... }` envelope; validation, authentication, authorization, conflict, and server failures return HTTP error statuses with an error response. Request validation uses Zod schemas in `lib/validation.ts` and `lib/mongo-validation.ts`; SQL parameters are passed separately from query text.

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/auth/register` | `POST` | Initial administrator setup / account registration flow |
| `/api/auth/login` | `POST` | Authenticate and create a database-backed session |
| `/api/auth/logout` | `POST` | Revoke the current session |
| `/api/auth/me` | `GET` | Return the current authenticated user |
| `/api/events` | `GET`, `POST` | Search/list and create events |
| `/api/events/[eventId]` | `GET`, `PATCH`, `DELETE` | Read, update, or cancel an event |
| `/api/events/[eventId]/summary` | `GET` | Read event financial summary |
| `/api/events/[eventId]/registrations` | `GET`, `POST`, `DELETE` | List, create, or cancel a registration |
| `/api/events/[eventId]/schedules` | `GET`, `POST` | List or create schedule items |
| `/api/schedules/[scheduleId]` | `PATCH`, `DELETE` | Update or remove a schedule item |
| `/api/events/[eventId]/tasks` | `GET`, `POST` | List or create event tasks |
| `/api/tasks/[taskId]` | `PATCH` | Update a task |
| `/api/resources` | `GET`, `POST` | Search/list and create resources |
| `/api/resources/[resourceId]` | `PATCH` | Update a resource |
| `/api/resources/[resourceId]/availability` | `POST` | Add an availability period |
| `/api/allocations` | `GET`, `POST` | List and transactionally request resource allocations |
| `/api/allocations/[allocationId]` | `PATCH` | Update allocation status/details |
| `/api/services` | `GET`, `POST` | List and create vendor services |
| `/api/service-bookings` | `GET`, `POST` | List and create service bookings |
| `/api/service-bookings/[bookingId]` | `PATCH` | Update service booking status/details |
| `/api/expenses` | `GET`, `POST` | List and record expenses |
| `/api/expenses/[expenseId]` | `PATCH` | Update or void an expense |
| `/api/users` | `GET`, `POST` | List and create team accounts |
| `/api/users/[userId]` | `PATCH` | Update account status/details |
| `/api/vendors/[vendorId]` | `PATCH` | Update vendor verification |
| `/api/vendor-catalog` | `GET`, `POST` | List and idempotently import descriptive MongoDB catalog documents; admins or vendors only |
| `/api/events/[eventId]/metadata` | `GET`, `PUT` | Read or replace manager-only MongoDB event notes and HTTPS attachment references |

Authorization is server-side. The shared authentication helpers resolve the session from an HTTP-only cookie and check roles and event ownership as needed. The endpoint inventory describes implemented route methods, not a claim that every route has a dedicated integration test.

## 12. UI screenshots

The implemented UI routes are `/`, `/events`, `/events/[eventId]`, `/resources`, `/bookings`, `/services`, `/vendor-catalog`, `/budget`, `/team`, `/login`, and `/register`. Event managers see the event metadata/attachment panel on an event detail page. No screenshot image files are currently checked into `docs/`, so this report does not include fabricated screenshots.

For a submission that requires visual evidence, capture the running application with representative data and insert screenshots with captions for:

1. Dashboard/workspace overview.
2. Event list and event detail (including schedules/tasks/registrations).
3. Resource catalogue and booking status.
4. Imported vendor catalog page and event metadata/attachment panel.
5. Budget/expense summary and team/access management.

Do not include real user passwords, session cookies, database credentials, or personal attendee data in screenshots.

## 13. Test plan, test cases, and results

### Automated validation performed

| Check | Result |
|---|---|
| `npm test` | Passed: 5 test files, 38 tests |
| `npm run build` | Passed: optimized production build, lint/type validation, and static page generation |

Tests use Vitest. The suites cover validation, authentication error handling, mocked PostgreSQL API-handler scenarios, MongoDB document boundaries, and mocked MongoDB API workflows. Mongo tests verify restricted flexible fields/HTTPS URLs, vendor ownership, descriptive catalog upserts, and event metadata updates. These tests do not substitute for running database-backed integration tests against live PostgreSQL and MongoDB servers.

### Database/manual scenarios

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| EV-01 | Create event with valid dates | Event row inserted | Not run against a live database |
| EV-02 | End date earlier than start | Request rejected | Unit validation covered; database integration not run |
| EV-03 | Search event by name | Matching rows returned | Mocked API test covered |
| RS-01 | Search active resources by type | Matching resources returned | Mocked API test covered |
| AL-01 | Allocate an available resource | Allocation commits | Transaction behavior covered with mocks; live database not run |
| AL-02 | Overlapping allocation exceeds inventory | Conflict and no second allocation | Mocked conflict/rollback covered; concurrency test not run |
| AL-03 | Allocate unavailable resource | Conflict and no allocation | Not run against a live database |
| DB-01 | Update/delete allocation | Audit record written | Not run against a live database |
| DB-02 | Read event overview | Summary rows returned | Not run against a live database |
| DB-03 | Call financial summary function | Calculated totals returned | Not run against a live database |
| SEC-01 | Unauthorized user changes event | Request denied | Automated security integration not run |
| MONGO-01 | Import the same vendor/source/external ID twice | One MongoDB document is refreshed idempotently | Mocked API test covered; live MongoDB not run |
| MONGO-02 | Add an attribute containing price/availability/booking fields | Request rejected | Unit validation covered |
| MONGO-03 | Vendor imports a catalog item for another vendor profile | HTTP 403 before MongoDB write | Mocked API test covered |
| MONGO-04 | Non-owner updates event metadata | Request denied before MongoDB access | Mocked API test covered; live integration not run |
| MONGO-05 | MongoDB is not configured or available | Clear 503 for MongoDB document features | Missing-configuration response covered with a mock; live outage not tested |

The repository's `docs/test-plan.md` contains the scenario list. Record dates, database versions, actual outcomes, and evidence when the remaining cases are run against disposable PostgreSQL and MongoDB instances.

## 14. Security considerations and limitations

### Implemented safeguards

- Passwords are stored as bcrypt hashes; the application does not seed usable demo passwords.
- Session tokens are random, stored in the database as SHA-256 hashes, and expire after seven days.
- The session cookie is HTTP-only, `SameSite=Lax`, path-scoped, and marked secure in production.
- Suspended accounts are excluded when resolving an authenticated session.
- Server-side role and event-ownership checks protect operations; input validation and parameterized SQL reduce malformed-input and injection risks.
- Allocation integrity is enforced in PostgreSQL as well as in the API workflow.
- MongoDB routes apply role/ownership checks, validate cross-database references in PostgreSQL, restrict attachment/source links to HTTPS, bound document sizes, and reject structured transactional fields.
- MongoDB connection failures are surfaced as service-unavailable responses for document features; PostgreSQL transactional workflows remain independent.
- `.env` and `.env.local` are ignored by Git; credentials should remain private.

### Limitations and deployment cautions

- This is a coursework/local-use implementation, not a hardened public production service.
- Login throttling and password reset/change/recovery flows are not implemented.
- TLS, production network/database hardening, backups, monitoring, and an independent security review are deployment responsibilities.
- End-to-end and real concurrency tests against the intended database/hosting setup remain outstanding.
- There is no distributed transaction across PostgreSQL and MongoDB. MongoDB references can become stale if a vendor profile is deleted; backup, monitoring, retention, and orphan-reference cleanup need operational handling.
- The project dependency audit reported 18 vulnerabilities during dependency restoration (12 moderate, 3 high, 3 critical). Review the dependency audit and upgrade compatibly before deployment; this report does not apply automatic breaking upgrades.
- The demo seed contains disabled placeholder accounts, not functional credentials. Configure the first administrator through `/register`.

## 16. Conclusion and future enhancements

Planora demonstrates polyglot persistence without duplicating core records: PostgreSQL provides relational integrity and transaction-safe booking operations, while MongoDB stores optional descriptive catalog imports and flexible event documents. The current implementation combines role-aware accounts, event and resource management, vendor services, operational records, financial reporting, and database-level booking safeguards. It demonstrates practical use of relational constraints, transactions, triggers, indexes, a view, a reporting function, and indexed document collections.

Recommended next steps are to run the pending PostgreSQL/MongoDB integration and concurrency cases, capture authentic UI screenshots, record actual team contributions, review and update vulnerable dependencies, and complete operational/security work before any internet-facing deployment. Further product enhancements could include password recovery, notification workflows, richer reporting, document retention/orphan cleanup, and migration-managed schema evolution.

## Appendix A. Source code map

The report documents the current source; the application source itself remains in its authoritative project files rather than being duplicated into this document.

| Area | Source |
|---|---|
| UI routes and styling | `app/`, `components/` |
| API Route Handlers | `app/api/` |
| Authentication, PostgreSQL pool, MongoDB client, validation, constants | `lib/` |
| Relational schema and sample data | `db/schema.sql`, `db/seed.sql` |
| Automated tests, including document/API tests | `tests/` |
| Architecture, ER notes, test plan | `docs/architecture.md`, `docs/ER-relationships.md`, `docs/test-plan.md` |

## Appendix B. Local run commands

Prerequisites are Node.js 20+, PostgreSQL 14+, MongoDB 6.0+, and npm. Start both database services, set both connection strings, then run the following in PowerShell from the project directory:

```powershell
npm install
createdb -U postgres planora

$env:DATABASE_URL = "postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/planora"
$env:PGSSL = "false"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/planora"
$env:MONGODB_DB = "planora"

psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f .\db\schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f .\db\seed.sql
npm run dev
```

Open `http://localhost:3000`. Apply the schema and seed only to the intended project database. Keep `.env.local` and database credentials private.
