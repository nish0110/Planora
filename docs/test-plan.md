# Planora test plan

| ID | Scenario | Expected result | Type |
|---|---|---|---|
| EV-01 | Create event with valid dates | Event row inserted | API integration |
| EV-02 | End date earlier than start | Request rejected | Unit / DB constraint |
| EV-03 | Search event by name | Matching rows returned | API integration |
| RS-01 | Search active resources by type | Only matching active resources returned | API integration |
| AL-01 | Allocate available resource | Allocation inserted and committed | DB integration |
| AL-02 | Allocate same indivisible resource for overlapping time | HTTP 409 conflict and no second allocation | Concurrency integration |
| AL-03 | Allocate a resource marked unavailable | HTTP 409 and no allocation | API integration |
| AL-04 | Use unknown event/resource/user ID | Request rejected | API integration |
| DB-01 | Update/delete allocation | Audit record written | Trigger integration |
| DB-02 | Read event overview | Event and organizer summary returned | SQL integration |
| DB-03 | Call financial summary function | Calculated totals returned | SQL integration |
| SEC-01 | Unauthorized user changes event or event metadata | Request denied by server-side role/ownership checks | Security integration |
| MONGO-01 | Import vendor item twice with the same vendor/source/external ID | A single MongoDB catalog document is refreshed idempotently | MongoDB API integration |
| MONGO-02 | Include nested price, inventory, availability, booking, or budget keys in flexible fields | Request rejected before MongoDB write | Unit / API validation |
| MONGO-03 | Vendor imports a catalog item for another vendor ID | HTTP 403 and no MongoDB write | Authorization integration |
| MONGO-04 | Non-owner reads or updates event metadata | Request denied and no MongoDB write | Authorization integration |
| MONGO-05 | MongoDB is stopped while a document feature is requested | Clear HTTP 503; PostgreSQL-backed workflows remain available | Failure integration |

Record actual results, execution date, and evidence screenshots during final testing. Vitest includes request-validation and mocked PostgreSQL/MongoDB API tests. Live database, failure, and concurrency integration cases remain to be executed in configured local environments.
