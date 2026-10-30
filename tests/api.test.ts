import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../lib/db';
import { GET as getEvents, POST as postEvent } from '../app/api/events/route';
import { GET as getResources } from '../app/api/resources/route';
import { GET as getAllocations, POST as postAllocation } from '../app/api/allocations/route';

vi.mock('../lib/db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

const eventPayload = {
  organizerId: 1,
  eventName: 'Design Summit',
  eventType: 'Conference',
  startDatetime: '2026-10-28T09:00:00+05:30',
  endDatetime: '2026-10-28T17:00:00+05:30',
  expectedAttendees: 100,
  totalBudget: 100000,
};

const allocationPayload = {
  eventId: 1,
  resourceId: 2,
  allocatedBy: 3,
  startDatetime: '2026-10-28T09:00:00+05:30',
  endDatetime: '2026-10-28T17:00:00+05:30',
  quantity: 1,
  totalCost: 200,
};

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function mockPoolResult<T extends QueryResultRow>(rows: T[]) {
  vi.mocked(pool.query).mockResolvedValueOnce(queryResult(rows) as never);
}

function mockPoolFailure(error: Error) {
  vi.mocked(pool.query).mockRejectedValueOnce(error);
}

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createClient(results: QueryResult[], finalError?: Error) {
  const query = vi.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  if (finalError) query.mockRejectedValueOnce(finalError);
  const client = { query, release: vi.fn() };
  vi.mocked(pool.connect).mockImplementation(
    (() => Promise.resolve(client as unknown as PoolClient)) as never
  );
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/events', () => {
  it('returns event rows', async () => {
    const rows = [{ event_id: 1, event_name: 'Design Summit' }];
    mockPoolResult(rows);

    const response = await getEvents(request('http://localhost/api/events'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: rows });
  });

  it('searches using a query parameter', async () => {
    mockPoolResult([]);

    await getEvents(request('http://localhost/api/events?q=design%27%20OR%201%3D1'));

    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('event_name ILIKE');
    expect(sql).not.toContain("design' OR 1=1");
    expect(values).toEqual(["design' OR 1=1"]);
  });

  it('returns 500 when the database query fails', async () => {
    mockPoolFailure(new Error('database unavailable'));

    const response = await getEvents(request('http://localhost/api/events'));

    expect(response.status).toBe(500);
  });
});

describe('POST /api/events', () => {
  it('creates a valid event and returns 201 with parameterized values', async () => {
    const created = { event_id: 1, event_name: eventPayload.eventName };
    mockPoolResult([created]);

    const response = await postEvent(request('http://localhost/api/events', eventPayload));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: created });
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9');
    expect(values).toContain(eventPayload.eventName);
  });

  it('rejects invalid event input with 400 without querying the database', async () => {
    const response = await postEvent(request('http://localhost/api/events', {
      ...eventPayload,
      eventName: '',
    }));

    expect(response.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 500 when event insertion fails', async () => {
    mockPoolFailure(new Error('database unavailable'));

    const response = await postEvent(request('http://localhost/api/events', eventPayload));

    expect(response.status).toBe(500);
  });
});

describe('GET /api/resources', () => {
  it('returns resources and passes search filters as query values', async () => {
    const rows = [{ resource_id: 2, resource_name: 'Design Hall' }];
    mockPoolResult(rows);

    const response = await getResources(
      request('http://localhost/api/resources?q=hall&type=Venue')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: rows });
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).not.toContain('hall');
    expect(values).toEqual(['hall', 'Venue']);
  });

  it('returns 500 when the database query fails', async () => {
    mockPoolFailure(new Error('database unavailable'));

    const response = await getResources(request('http://localhost/api/resources'));

    expect(response.status).toBe(500);
  });
});

describe('GET /api/allocations', () => {
  it('returns allocations and passes eventId as a query value', async () => {
    const rows = [{ allocation_id: 4, event_id: 1 }];
    mockPoolResult(rows);

    const response = await getAllocations(
      request('http://localhost/api/allocations?eventId=1')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: rows });
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('a.event_id = $1');
    expect(values).toEqual(['1']);
  });

  it('returns 500 when the database query fails', async () => {
    mockPoolFailure(new Error('database unavailable'));

    const response = await getAllocations(request('http://localhost/api/allocations'));

    expect(response.status).toBe(500);
  });
});

describe('POST /api/allocations', () => {
  it('rejects invalid input without opening a database connection', async () => {
    const response = await postAllocation(request('http://localhost/api/allocations', {
      ...allocationPayload,
      quantity: 0,
    }));

    expect(response.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('creates an allocation using parameterized values', async () => {
    const created = { allocation_id: 5, event_id: 1, resource_id: 2 };
    const client = createClient([
      queryResult([]),
      queryResult([{ resource_id: 2, capacity: null, availability_status: 'ACTIVE' }]),
      queryResult([{ event_id: 1, expected_attendees: 100 }]),
      queryResult([]),
      queryResult([created]),
      queryResult([]),
    ]);

    const response = await postAllocation(
      request('http://localhost/api/allocations', allocationPayload)
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: created });
    const [insertSql, insertValues] = client.query.mock.calls[4];
    expect(insertSql).toContain('VALUES($1,$2,$3,$4,$5,$6');
    expect(insertValues).toContain(allocationPayload.resourceId);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects a booking that conflicts with an existing allocation', async () => {
    const conflict = Object.assign(new Error('overlapping allocation'), { code: '23P01' });
    const client = createClient([
      queryResult([]),
      queryResult([{ resource_id: 2, capacity: null, availability_status: 'ACTIVE' }]),
      queryResult([{ event_id: 1, expected_attendees: 100 }]),
      queryResult([]),
    ], conflict);

    const response = await postAllocation(
      request('http://localhost/api/allocations', allocationPayload)
    );

    expect(response.status).toBe(409);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
