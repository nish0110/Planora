# Planora ER relationship guide

- `roles (1) → (M) users`: each user has one role.
- `users (1) → (M) events`: an organizer can create many events.
- `resource_types (1) → (M) resources`: each resource belongs to one type.
- `events (M) ↔ (N) resources`: implemented through `resource_allocations`.
- `events (1) → (M) event_resource_requirements`.
- `resources (1) → (M) resource_availability`.
- `users (1) → (0..1) vendor_profiles`; a vendor profile belongs to one user.
- `vendor_profiles (1) → (M) services`.
- `events (1) → (M) event_service_bookings`; each booking references one service.
- `events (1) → (M) event_schedules`.
- `events (1) → (M) event_tasks`; a task may be assigned to one user.
- `events (1) → (M) event_registrations`; users can register for multiple events, with one registration per event/user pair.
- `events (1) → (0..1) event_budgets`.
- `events (1) → (M) expenses`.
- `events (1) → (M) feedback`; one user can leave at most one feedback record per event.

`resource_allocations` and `event_service_bookings` are separate because physical resources and vendor-delivered services can have different availability and confirmation rules.
