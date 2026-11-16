import { MongoServerSelectionError } from 'mongodb';
import { NextResponse } from 'next/server';

export function mongoErrorResponse(error: unknown, operation: string, fallback: string) {
  console.error(operation, error);
  if (error instanceof MongoServerSelectionError) {
    return NextResponse.json({ error: 'MongoDB is unavailable. Check MONGODB_URI and ensure the service is running.' }, { status: 503 });
  }
  if (error instanceof Error && error.message.startsWith('MongoDB is not configured.')) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
