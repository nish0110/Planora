# Planora project report outline

1. Abstract
2. Problem statement and motivation
3. Objectives and scope
4. Functional requirements and user roles
5. System architecture (Next.js → API layer → PostgreSQL)
6. ER diagram and relational schema
7. Database selection and justification
8. Data dictionary
9. Constraints and integrity rules
10. Advanced concepts: transactions, triggers, function, view, indexes
11. API design
12. UI screenshots
13. Test plan, test cases, and results
14. Security considerations and limitations
15. Team member contributions
16. Conclusion and future enhancements

## Problem statement
Event organizers must coordinate event schedules, venues, equipment, vendors, attendees, and budgets. Manual coordination can create overlapping bookings, capacity mismatches, and poor cost visibility. Planora centralizes these records and provides database-backed event creation, resource search, allocation checks, and budget-oriented reporting.

## Objectives
- Maintain consistent relational records for events and resources.
- Prevent overlapping allocations for indivisible resources.
- Track requirements, schedules, tasks, registrations, and expenses.
- Demonstrate transactions, triggers, views, functions, indexes, and constraints.
- Provide a responsive Next.js interface backed by API routes.

## Current prototype limitations
The dashboard and workspace screens use the live PostgreSQL-backed API. Authentication and role enforcement, event operations, resource/service booking workflows, registrations, expenses, and inventory-capacity checks are implemented for the coursework/local-use scope. End-to-end database and concurrency tests should be run against a disposable PostgreSQL environment before deployment.
