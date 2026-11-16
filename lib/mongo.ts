import { Db, MongoClient } from 'mongodb';

type MongoState = {
  key: string;
  clientPromise: Promise<MongoClient>;
  indexesPromise?: Promise<void>;
};

const globalForMongo = globalThis as typeof globalThis & {
  planoraMongoState?: MongoState;
};

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MongoDB is not configured. Set MONGODB_URI before using MongoDB features.');
  }

  const databaseName = process.env.MONGODB_DB || 'planora';
  const key = `${uri}\n${databaseName}`;
  let state = globalForMongo.planoraMongoState;
  if (!state || state.key !== key) {
    state = {
      key,
      clientPromise: new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect(),
    };
    globalForMongo.planoraMongoState = state;
  }

  let client: MongoClient;
  try {
    client = await state.clientPromise;
  } catch (error) {
    if (globalForMongo.planoraMongoState === state) globalForMongo.planoraMongoState = undefined;
    throw error;
  }

  const db = client.db(databaseName);
  if (!state.indexesPromise) {
    state.indexesPromise = Promise.all([
      db.collection('vendor_catalog_items').createIndex(
        { vendorId: 1, source: 1, externalId: 1 },
        { unique: true },
      ),
      db.collection('event_metadata').createIndex({ eventId: 1 }, { unique: true }),
    ]).then(() => undefined);
  }

  try {
    await state.indexesPromise;
  } catch (error) {
    state.indexesPromise = undefined;
    throw error;
  }

  return db;
}
