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
| SEC-01 | Unauthorized user changes event | Request denied after auth is implemented | Security integration |

Record actual results, execution date, and evidence screenshots during final testing. The repository currently includes unit tests for request validation; database integration cases remain to be executed in a configured local environment.
