import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import type { QueryResult, QueryResultRow } from 'pg';
import { getCurrentUser, canManageEvent } from '../lib/auth';
import { pool } from '../lib/db';
import { getMongoDb } from '../lib/mongo';
import { POST as importCatalogItem } from '../app/api/vendor-catalog/route';
import { PUT as putEventMetadata } from '../app/api/events/[eventId]/metadata/route';

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>();
  return {
    ...actual,
    canManageEvent: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

vi.mock('../lib/db', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../lib/mongo', () => ({
  getMongoDb: vi.fn(),
}));

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function request(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({
    user_id: 1,
    full_name: 'Test Admin',
    email: 'admin@example.test',
    role_name: 'ADMIN',
  });
  vi.mocked(canManageEvent).mockResolvedValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/vendor-catalog', () => {
  it('upserts descriptive catalog data in MongoDB using a PostgreSQL vendor reference', async () => {
    const document = {
      _id: { toHexString: () => 'catalog-id' },
      vendorId: 17,
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      description: 'A flexible catalog description.',
      category: 'Decor',
      sourceUrl: null,
      tags: ['garden'],
      attributes: { material: 'linen' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      importedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
    const findOne = vi.fn().mockResolvedValue(document);
    const collection = { updateOne, findOne };
    vi.mocked(getMongoDb).mockResolvedValue({
      collection: vi.fn(() => collection),
    } as unknown as Db);
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ exists: 1 }]) as never);

    const response = await importCatalogItem(request('http://localhost/api/vendor-catalog', {
      vendorId: 17,
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
      tags: ['garden'],
      attributes: { material: 'linen' },
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      id: 'catalog-id',
      vendorId: 17,
      title: 'Garden table centerpiece',
    });
    expect(updateOne).toHaveBeenCalledWith(
      { vendorId: 17, source: 'vendor-feed', externalId: 'item-17' },
      expect.objectContaining({
        $set: expect.not.objectContaining({ price: expect.anything(), availability: expect.anything() }),
      }),
      { upsert: true },
    );
  });

  it('prevents a vendor from importing a catalog item for another vendor profile', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      user_id: 9,
      full_name: 'Vendor',
      email: 'vendor@example.test',
      role_name: 'VENDOR',
    });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ vendor_id: 17 }]) as never);

    const response = await importCatalogItem(request('http://localhost/api/vendor-catalog', {
      vendorId: 99,
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
    }));

    expect(response.status).toBe(403);
    expect(getMongoDb).not.toHaveBeenCalled();
  });

  it('returns an explicit service-unavailable response when MongoDB is not configured', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ exists: 1 }]) as never);
    vi.mocked(getMongoDb).mockRejectedValueOnce(new Error('MongoDB is not configured. Set MONGODB_URI before using MongoDB features.'));

    const response = await importCatalogItem(request('http://localhost/api/vendor-catalog', {
      vendorId: 17,
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
    }));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('MONGODB_URI');
  });
});

describe('PUT /api/events/[eventId]/metadata', () => {
  it('stores flexible metadata and attachment references under the PostgreSQL event ID', async () => {
    const document = {
      _id: { toHexString: () => 'metadata-id' },
      eventId: 42,
      metadata: { theme: 'Garden' },
      attachments: [{ name: 'Brief', url: 'https://files.example/brief.pdf', description: '' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
    const findOne = vi.fn().mockResolvedValue(document);
    const collection = { updateOne, findOne };
    vi.mocked(getMongoDb).mockResolvedValue({
      collection: vi.fn(() => collection),
    } as unknown as Db);
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ exists: 1 }]) as never);

    const response = await putEventMetadata(
      request('http://localhost/api/events/42/metadata', {
        metadata: { theme: 'Garden' },
        attachments: [{ name: 'Brief', url: 'https://files.example/brief.pdf' }],
      }, 'PUT'),
      { params: { eventId: '42' } },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ eventId: 42, metadata: { theme: 'Garden' } });
    expect(updateOne).toHaveBeenCalledWith(
      { eventId: 42 },
      expect.objectContaining({
        $set: expect.objectContaining({ metadata: { theme: 'Garden' } }),
        $setOnInsert: expect.objectContaining({ eventId: 42 }),
      }),
      { upsert: true },
    );
  });

  it('denies event metadata access to a non-owner before contacting MongoDB', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      user_id: 2,
      full_name: 'Organizer',
      email: 'organizer@example.test',
      role_name: 'ORGANIZER',
    });
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ exists: 1 }]) as never);
    vi.mocked(canManageEvent).mockResolvedValueOnce(false);

    const response = await putEventMetadata(
      request('http://localhost/api/events/42/metadata', { metadata: {}, attachments: [] }, 'PUT'),
      { params: { eventId: '42' } },
    );

    expect(response.status).toBe(403);
    expect(getMongoDb).not.toHaveBeenCalled();
  });
});
