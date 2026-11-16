import { NextRequest, NextResponse } from 'next/server';
import { canManageEvent, getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import type { AppUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getMongoDb } from '@/lib/mongo';
import { eventMetadataSchema } from '@/lib/mongo-validation';
import { mongoErrorResponse } from '@/lib/mongo-response';

export const runtime = 'nodejs';

type EventMetadataDocument = {
  eventId: number;
  metadata: Record<string, unknown>;
  attachments: { name: string; url: string; description: string }[];
  createdAt: Date;
  updatedAt: Date;
  _id: { toHexString(): string };
};

type EventManagerAccess =
  | { authorized: false; response: NextResponse }
  | { authorized: true; user: AppUser; eventId: number };

function serializeMetadata(document: EventMetadataDocument | null, eventId: number) {
  if (!document) return { eventId, metadata: {}, attachments: [], updatedAt: null };
  return {
    id: document._id.toHexString(),
    eventId: document.eventId,
    metadata: document.metadata,
    attachments: document.attachments,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

async function authorizeEventManager(request: NextRequest, eventIdValue: string): Promise<EventManagerAccess> {
  const user = await getCurrentUser(request);
  if (!user) return { authorized: false, response: unauthorizedResponse() };
  const eventId = Number(eventIdValue);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return { authorized: false, response: NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 }) };
  }

  const event = await pool.query('SELECT 1 FROM events WHERE event_id = $1', [eventId]);
  if (!event.rowCount) {
    return { authorized: false, response: NextResponse.json({ error: 'Event not found.' }, { status: 404 }) };
  }
  if (!(await canManageEvent(user, eventId))) {
    return { authorized: false, response: forbiddenResponse() };
  }
  return { authorized: true, user, eventId };
}

export async function GET(request: NextRequest, context: { params: { eventId: string } }) {
  let access: EventManagerAccess;
  try {
    access = await authorizeEventManager(request, context.params.eventId);
  } catch (error) {
    console.error('GET /api/events/[eventId]/metadata authorization', error);
    return NextResponse.json({ error: 'Could not authorize event metadata access.' }, { status: 500 });
  }
  if (!access.authorized) return access.response;

  try {
    const document = await (await getMongoDb())
      .collection<EventMetadataDocument>('event_metadata')
      .findOne({ eventId: access.eventId });
    return NextResponse.json({ data: serializeMetadata(document, access.eventId) });
  } catch (error) {
    return mongoErrorResponse(error, 'GET /api/events/[eventId]/metadata', 'Could not load event metadata.');
  }
}

export async function PUT(request: NextRequest, context: { params: { eventId: string } }) {
  let access: EventManagerAccess;
  try {
    access = await authorizeEventManager(request, context.params.eventId);
  } catch (error) {
    console.error('PUT /api/events/[eventId]/metadata authorization', error);
    return NextResponse.json({ error: 'Could not authorize event metadata changes.' }, { status: 500 });
  }
  if (!access.authorized) return access.response;

  const parsed = eventMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event metadata.', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const now = new Date();
    const collection = (await getMongoDb()).collection<EventMetadataDocument>('event_metadata');
    await collection.updateOne(
      { eventId: access.eventId },
      {
        $set: {
          metadata: parsed.data.metadata,
          attachments: parsed.data.attachments,
          updatedAt: now,
        },
        $setOnInsert: { eventId: access.eventId, createdAt: now },
      },
      { upsert: true },
    );
    const saved = await collection.findOne({ eventId: access.eventId });
    if (!saved) throw new Error('Event metadata could not be read after saving.');
    return NextResponse.json({ data: serializeMetadata(saved, access.eventId) });
  } catch (error) {
    return mongoErrorResponse(error, 'PUT /api/events/[eventId]/metadata', 'Could not save event metadata.');
  }
}
