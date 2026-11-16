import { MongoServerError } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getMongoDb } from '@/lib/mongo';
import { vendorCatalogImportSchema } from '@/lib/mongo-validation';
import { mongoErrorResponse } from '@/lib/mongo-response';

export const runtime = 'nodejs';

type VendorCatalogDocument = {
  vendorId: number;
  source: string;
  externalId: string;
  title: string;
  description: string;
  category: string;
  sourceUrl: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  createdAt: Date;
  importedAt: Date;
};

function serializeCatalogDocument(document: VendorCatalogDocument & { _id: { toHexString(): string } }) {
  const { _id, ...fields } = document;
  return {
    ...fields,
    id: _id.toHexString(),
    createdAt: fields.createdAt.toISOString(),
    importedAt: fields.importedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'VENDOR'].includes(user.role_name)) return forbiddenResponse();

  const requestedVendorId = request.nextUrl.searchParams.get('vendorId');
  if (requestedVendorId !== null && (!/^[1-9]\d*$/.test(requestedVendorId) || !Number.isSafeInteger(Number(requestedVendorId)))) {
    return NextResponse.json({ error: 'Invalid vendor ID.' }, { status: 400 });
  }

  try {
    let vendorId = requestedVendorId === null ? undefined : Number(requestedVendorId);
    if (user.role_name === 'VENDOR') {
      const profile = await pool.query(
        'SELECT vendor_id FROM vendor_profiles WHERE user_id = $1',
        [user.user_id],
      );
      if (!profile.rowCount) return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 403 });
      const ownedVendorId = Number(profile.rows[0].vendor_id);
      if (!Number.isSafeInteger(ownedVendorId)) throw new Error('Vendor ID exceeds the supported integer range.');
      if (vendorId !== undefined && vendorId !== ownedVendorId) return forbiddenResponse();
      vendorId = ownedVendorId;
    } else if (vendorId !== undefined) {
      const profile = await pool.query('SELECT 1 FROM vendor_profiles WHERE vendor_id = $1', [vendorId]);
      if (!profile.rowCount) return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 404 });
    }

    const filter = vendorId === undefined ? {} : { vendorId };
    const documents = await (await getMongoDb())
      .collection<VendorCatalogDocument>('vendor_catalog_items')
      .find(filter)
      .sort({ importedAt: -1 })
      .limit(100)
      .toArray();
    return NextResponse.json({ data: documents.map(serializeCatalogDocument) });
  } catch (error) {
    return mongoErrorResponse(error, 'GET /api/vendor-catalog', 'Could not load imported vendor catalog data.');
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  if (!['ADMIN', 'VENDOR'].includes(user.role_name)) return forbiddenResponse();

  const parsed = vendorCatalogImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid vendor catalog import.', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    let vendorId = parsed.data.vendorId;
    if (user.role_name === 'VENDOR') {
      const profile = await pool.query(
        'SELECT vendor_id FROM vendor_profiles WHERE user_id = $1',
        [user.user_id],
      );
      if (!profile.rowCount) return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 403 });
      vendorId = Number(profile.rows[0].vendor_id);
      if (!Number.isSafeInteger(vendorId)) throw new Error('Vendor ID exceeds the supported integer range.');
      if (parsed.data.vendorId !== undefined && parsed.data.vendorId !== vendorId) return forbiddenResponse();
    } else if (vendorId === undefined) {
      return NextResponse.json({ error: 'Admin imports must include a vendorId.' }, { status: 400 });
    }

    const vendor = await pool.query('SELECT 1 FROM vendor_profiles WHERE vendor_id = $1', [vendorId]);
    if (!vendor.rowCount) return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 404 });

    const { source, externalId, title, description, category, sourceUrl, tags, attributes } = parsed.data;
    const identity = { vendorId, source, externalId };
    const now = new Date();
    const changes = {
      title,
      description,
      category,
      sourceUrl: sourceUrl ?? null,
      tags,
      attributes,
      importedAt: now,
    };
    const collection = (await getMongoDb()).collection<VendorCatalogDocument>('vendor_catalog_items');
    let created = false;
    try {
      const result = await collection.updateOne(
        identity,
        { $set: changes, $setOnInsert: { ...identity, createdAt: now } },
        { upsert: true },
      );
      created = result.upsertedCount > 0;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      await collection.updateOne(identity, { $set: changes });
    }

    const saved = await collection.findOne(identity);
    if (!saved) throw new Error('Imported vendor catalog record could not be read after saving.');
    return NextResponse.json({ data: serializeCatalogDocument(saved) }, { status: created ? 201 : 200 });
  } catch (error) {
    return mongoErrorResponse(error, 'POST /api/vendor-catalog', 'Could not import vendor catalog data.');
  }
}
