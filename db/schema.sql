-- Planora PostgreSQL schema. Run with: npm run db:setup
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS roles (
  role_id BIGSERIAL PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE CHECK (role_name IN ('ADMIN','ORGANIZER','VENDOR','STAFF','ATTENDEE'))
);
CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(role_id),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone VARCHAR(30),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  event_id BIGSERIAL PRIMARY KEY,
  organizer_id BIGINT NOT NULL REFERENCES users(user_id),
  event_name VARCHAR(180) NOT NULL,
  description TEXT,
  event_type VARCHAR(80) NOT NULL,
  location TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  expected_attendees INTEGER NOT NULL DEFAULT 0 CHECK (expected_attendees >= 0),
  total_budget NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNING','CONFIRMED','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_valid_period CHECK (end_datetime > start_datetime)
);
CREATE TABLE IF NOT EXISTS resource_types (
  resource_type_id BIGSERIAL PRIMARY KEY,
  type_name VARCHAR(80) NOT NULL UNIQUE,
  description TEXT
);
CREATE TABLE IF NOT EXISTS resources (
  resource_id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(resource_type_id),
  resource_name VARCHAR(180) NOT NULL,
  description TEXT,
  location TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  quantity_available INTEGER NOT NULL DEFAULT 1 CHECK (quantity_available > 0),
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  availability_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (availability_status IN ('ACTIVE','INACTIVE','MAINTENANCE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resource_availability (
  availability_id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  availability_status TEXT NOT NULL CHECK (availability_status IN ('AVAILABLE','UNAVAILABLE')),
  reason TEXT,
  CHECK (end_datetime > start_datetime)
);
CREATE TABLE IF NOT EXISTS event_resource_requirements (
  requirement_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  resource_type_id BIGINT NOT NULL REFERENCES resource_types(resource_type_id),
  quantity_required INTEGER NOT NULL DEFAULT 1 CHECK (quantity_required > 0),
  min_capacity INTEGER CHECK (min_capacity IS NULL OR min_capacity >= 0),
  max_budget NUMERIC(12,2) CHECK (max_budget IS NULL OR max_budget >= 0),
  requirement_notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIALLY_FULFILLED','FULFILLED','CANCELLED'))
);
CREATE TABLE IF NOT EXISTS resource_allocations (
  allocation_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id),
  resource_id BIGINT NOT NULL REFERENCES resources(resource_id),
  allocated_by BIGINT NOT NULL REFERENCES users(user_id),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  allocation_status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (allocation_status IN ('PENDING','CONFIRMED','CANCELLED')),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_datetime > start_datetime)
);
-- For single-capacity resources (venues, individual staff, one equipment kit), reject overlapping active allocations.
ALTER TABLE resource_allocations DROP CONSTRAINT IF EXISTS no_overlapping_single_resource;
ALTER TABLE resource_allocations ADD CONSTRAINT no_overlapping_single_resource
  EXCLUDE USING gist (resource_id WITH =, tstzrange(start_datetime, end_datetime, '[)') WITH &&)
  WHERE (allocation_status = 'CONFIRMED' AND quantity = 1);
CREATE TABLE IF NOT EXISTS vendor_profiles (
  vendor_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  business_name VARCHAR(180) NOT NULL,
  business_category VARCHAR(100) NOT NULL,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED'))
);
CREATE TABLE IF NOT EXISTS services (
  service_id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES vendor_profiles(vendor_id) ON DELETE CASCADE,
  service_name VARCHAR(180) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  service_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (service_status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS event_service_bookings (
  booking_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id),
  service_id BIGINT NOT NULL REFERENCES services(service_id),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  quoted_price NUMERIC(12,2) NOT NULL CHECK (quoted_price >= 0),
  booking_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (booking_status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_datetime > start_datetime)
);
CREATE TABLE IF NOT EXISTS event_schedules (
  schedule_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  activity_name VARCHAR(180) NOT NULL,
  description TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  CHECK (end_datetime > start_datetime)
);
CREATE TABLE IF NOT EXISTS event_tasks (
  task_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  task_name VARCHAR(180) NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','DONE','BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_registrations (
  registration_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  attendee_id BIGINT NOT NULL REFERENCES users(user_id),
  registration_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  registration_status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (registration_status IN ('REGISTERED','WAITLISTED','CANCELLED','CHECKED_IN')),
  check_in_time TIMESTAMPTZ,
  UNIQUE(event_id, attendee_id)
);
CREATE TABLE IF NOT EXISTS event_budgets (
  budget_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL UNIQUE REFERENCES events(event_id) ON DELETE CASCADE,
  total_budget NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expenses (
  expense_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by BIGINT NOT NULL REFERENCES users(user_id),
  status TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED','VOIDED'))
);
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by BIGINT,
  old_data JSONB,
  new_data JSONB
);
-- Useful indexes for common filters and joins.
CREATE INDEX IF NOT EXISTS idx_events_organizer_start ON events(organizer_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, start_datetime);
CREATE INDEX IF NOT EXISTS idx_resources_type_status ON resources(resource_type_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_allocations_event_status ON resource_allocations(event_id, allocation_status);
CREATE INDEX IF NOT EXISTS idx_allocations_resource_period ON resource_allocations(resource_id, start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_tasks_event_status_deadline ON event_tasks(event_id, status, deadline);
CREATE INDEX IF NOT EXISTS idx_expenses_event_date ON expenses(event_id, expense_date) WHERE status = 'RECORDED';
CREATE INDEX IF NOT EXISTS idx_services_vendor_status ON services(vendor_id, service_status);
-- Audit trigger function.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_row JSONB; new_row JSONB; row_id BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN new_row := to_jsonb(NEW); row_id := (new_row ->> TG_ARGV[0])::BIGINT;
  ELSIF TG_OP = 'UPDATE' THEN old_row := to_jsonb(OLD); new_row := to_jsonb(NEW); row_id := (new_row ->> TG_ARGV[0])::BIGINT;
  ELSE old_row := to_jsonb(OLD); row_id := (old_row ->> TG_ARGV[0])::BIGINT;
  END IF;
  INSERT INTO audit_log(table_name, record_id, action, old_data, new_data)
  VALUES (TG_TABLE_NAME, row_id, TG_OP, old_row, new_row);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
DROP TRIGGER IF EXISTS trg_allocations_audit ON resource_allocations;
CREATE TRIGGER trg_allocations_audit AFTER INSERT OR UPDATE OR DELETE ON resource_allocations
FOR EACH ROW EXECUTE FUNCTION audit_row_change('allocation_id');
DROP TRIGGER IF EXISTS trg_expenses_audit ON expenses;
CREATE TRIGGER trg_expenses_audit AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION audit_row_change('expense_id');
-- Function for live event budget summary.
CREATE OR REPLACE FUNCTION get_event_financial_summary(p_event_id BIGINT)
RETURNS TABLE(event_id BIGINT, planned_budget NUMERIC, allocated_cost NUMERIC, recorded_expenses NUMERIC, remaining_budget NUMERIC)
LANGUAGE SQL STABLE AS $$
  SELECT e.event_id, e.total_budget,
    COALESCE(a.total,0), COALESCE(x.total,0),
    e.total_budget - COALESCE(a.total,0) - COALESCE(x.total,0)
  FROM events e
  LEFT JOIN (SELECT event_id, SUM(total_cost) total FROM resource_allocations WHERE allocation_status='CONFIRMED' GROUP BY event_id) a ON a.event_id=e.event_id
  LEFT JOIN (SELECT event_id, SUM(amount) total FROM expenses WHERE status='RECORDED' GROUP BY event_id) x ON x.event_id=e.event_id
  WHERE e.event_id=p_event_id;
$$;
CREATE OR REPLACE VIEW event_overview AS
SELECT e.event_id, e.event_name, e.event_type, e.start_datetime, e.end_datetime, e.status,
       u.full_name AS organizer_name, e.expected_attendees,
       (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id=e.event_id AND r.registration_status IN ('REGISTERED','CHECKED_IN')) AS registration_count,
       (SELECT COUNT(*) FROM resource_allocations a WHERE a.event_id=e.event_id AND a.allocation_status='CONFIRMED') AS confirmed_allocations,
       e.total_budget
FROM events e JOIN users u ON u.user_id=e.organizer_id;
-- Starter reference data. Password hashes are intentionally not seeded; create users through your future auth flow.
INSERT INTO roles(role_name) VALUES ('ADMIN'),('ORGANIZER'),('VENDOR'),('STAFF'),('ATTENDEE') ON CONFLICT DO NOTHING;
INSERT INTO resource_types(type_name, description) VALUES
 ('Venue','Physical event spaces'),('Equipment','Audio, visual, and event equipment'),('Staff','Event staff and crew'),('Service','External event services') ON CONFLICT DO NOTHING;
COMMIT;
