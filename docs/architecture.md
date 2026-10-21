# Planora architecture

```text
Browser
  │
  ▼
Next.js UI (App Router, TypeScript)
  │ HTTP requests
  ▼
Next.js Route Handlers (/api/events, /api/resources, /api/allocations)
  │ validation + business rules
  ▼
PostgreSQL connection pool (pg)
  │
  ├── relational tables + PK/FK/CHECK/UNIQUE constraints
  ├── exclusion constraint for overlapping single-unit allocations
  ├── transactions
  ├── audit triggers + audit_log
  ├── event_overview view
  └── get_event_financial_summary() function
```

The API layer validates incoming data and uses parameterized SQL. Allocation creation opens a transaction, locks the resource row, checks event capacity and blocked periods, inserts the allocation, then commits. PostgreSQL's exclusion constraint is the final guard against overlapping confirmed allocations for indivisible resources.
