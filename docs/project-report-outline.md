# Planora project report outline

1. Abstract
2. Problem statement and motivation
3. Objectives and scope
4. Functional requirements and user roles
5. System architecture (Next.js → API layer → PostgreSQL + MongoDB)
6. ER diagram, relational schema, and MongoDB document collections
7. Database selection and polyglot-persistence justification
8. Relational data dictionary and MongoDB document dictionary
9. Constraints and integrity rules
10. Advanced concepts: transactions, triggers, function, view, indexes
11. API design
12. UI screenshots
13. Test plan, test cases, and results
14. Security considerations and limitations
15. Team member contributions
16. Conclusion and future enhancements

## Problem statement
Event organizers must coordinate event schedules, venues, equipment, vendors, attendees, and budgets. Manual coordination can create overlapping bookings, capacity mismatches, and poor cost visibility. Planora keeps operational records in PostgreSQL and provides database-backed event creation, resource search, allocation checks, and budget-oriented reporting, with optional imported catalog descriptions and event notes in MongoDB.

## Objectives
- Maintain consistent relational records for events and resources.
- Keep PostgreSQL as the source of truth for prices, inventory, availability, and bookings.
- Store imported vendor descriptions and optional event metadata in MongoDB without duplicating transactional records.
- Enforce available resource-unit capacity and prevent overlapping service bookings.
- Track requirements, schedules, tasks, registrations, and expenses.
- Demonstrate transactions, triggers, views, functions, indexes, and constraints.
- Provide a responsive Next.js interface backed by API routes.

## Current prototype limitations
The dashboard and workspace screens use the live PostgreSQL-backed API. Authentication and role enforcement, event operations, resource/service booking workflows, registrations, expenses, and inventory-capacity checks are PostgreSQL-backed. MongoDB stores optional imported vendor catalog descriptions and event metadata/attachment references. End-to-end database and concurrency tests should be run against disposable PostgreSQL and MongoDB environments before deployment.
