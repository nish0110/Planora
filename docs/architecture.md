# Planora architecture

```text
Browser
  │
  ▼
Next.js UI (App Router, TypeScript)
  │ HTTP requests
  ▼
Next.js Route Handlers (/api/...)
  │ validation + authentication/authorization
  ├──────────────────────────────────────────┐
  ▼                                          ▼
PostgreSQL (pg)                         MongoDB (mongodb)
  │                                          │
  ├── events, accounts, resources,           ├── vendor_catalog_items
  │   prices, availability, bookings,        └── event_metadata
  │   expenses, schedules, tasks
  ├── PK/FK/CHECK/UNIQUE constraints
  ├── transactions + allocation trigger
  ├── service-booking exclusion constraint
  ├── audit triggers + audit_log
  ├── event_overview view
  └── get_event_financial_summary() function
```

PostgreSQL is the source of truth for event and vendor identities and all transactional values, including prices, inventory, availability, allocations, and bookings. MongoDB stores only noncritical imported catalog descriptions and flexible event metadata/attachment references. Mongo documents retain PostgreSQL `vendor_id` or `event_id` references without copying the referenced records; the databases are not written as duplicate sources of truth.

The API validates incoming SQL and document payloads separately. Resource allocation opens a PostgreSQL transaction, locks the resource row, checks event capacity and blocked periods, inserts the allocation, then commits. A PostgreSQL trigger enforces resource allocation capacity, and an exclusion constraint enforces service booking conflicts. MongoDB initializes a unique compound vendor/source/external-ID index for imported catalog items and a unique event-ID index for event metadata.

There is deliberately no distributed transaction across the databases: the MongoDB documents are optional, noncritical extensions. Event managers can edit an event's flexible document; administrators and vendors can import catalog descriptions. The API validates the corresponding PostgreSQL entity/ownership before writing its MongoDB reference.
