-- Optional local demo data. Run after schema.sql.
-- Password hash is intentionally unusable; authentication is not enabled in this MVP.
INSERT INTO users(role_id,full_name,email,password_hash) VALUES
 ((SELECT role_id FROM roles WHERE role_name='ADMIN'),'Planora Demo Admin','admin@planora.local','DISABLED_DEMO_ACCOUNT'),
 ((SELECT role_id FROM roles WHERE role_name='ORGANIZER'),'Alex Morgan','alex@planora.local','DISABLED_DEMO_ACCOUNT')
ON CONFLICT(email) DO NOTHING;
INSERT INTO events(organizer_id,event_name,description,event_type,location,start_datetime,end_datetime,expected_attendees,total_budget,status)
SELECT u.user_id,'Design Forward Summit','A one-day design and product conference.','Conference','The Glasshouse','2026-10-28 09:00+05:30','2026-10-28 17:30+05:30',180,180000,'PLANNING' FROM users u WHERE u.email='alex@planora.local'
AND NOT EXISTS(SELECT 1 FROM events e WHERE e.event_name='Design Forward Summit');
INSERT INTO events(organizer_id,event_name,description,event_type,location,start_datetime,end_datetime,expected_attendees,total_budget,status)
SELECT u.user_id,'Autumn Makers Market','A local makers and crafts market.','Community','Riverside Hall','2026-11-02 10:00+05:30','2026-11-02 16:00+05:30',320,140000,'CONFIRMED' FROM users u WHERE u.email='alex@planora.local'
AND NOT EXISTS(SELECT 1 FROM events e WHERE e.event_name='Autumn Makers Market');
INSERT INTO resources(resource_type_id,resource_name,description,location,capacity,quantity_available,base_price)
SELECT t.resource_type_id,'The Glasshouse','Light-filled event space with flexible seating.','Central district',250,1,45000 FROM resource_types t WHERE t.type_name='Venue'
AND NOT EXISTS(SELECT 1 FROM resources r WHERE r.resource_name='The Glasshouse');
INSERT INTO resources(resource_type_id,resource_name,description,location,capacity,quantity_available,base_price)
SELECT t.resource_type_id,'Riverside Hall','Adaptable hall for community gatherings.','Riverside',400,1,32000 FROM resource_types t WHERE t.type_name='Venue'
AND NOT EXISTS(SELECT 1 FROM resources r WHERE r.resource_name='Riverside Hall');
INSERT INTO resources(resource_type_id,resource_name,description,location,capacity,quantity_available,base_price)
SELECT t.resource_type_id,'Studio 08 AV Kit','Projector, two wireless microphones and speakers.','Equipment inventory',NULL,1,8500 FROM resource_types t WHERE t.type_name='Equipment'
AND NOT EXISTS(SELECT 1 FROM resources r WHERE r.resource_name='Studio 08 AV Kit');
