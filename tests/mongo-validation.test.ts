import { describe, expect, it } from 'vitest';
import { eventMetadataSchema, vendorCatalogImportSchema } from '../lib/mongo-validation';

describe('MongoDB document validation', () => {
  it('accepts flexible catalog descriptions without transactional fields', () => {
    const result = vendorCatalogImportSchema.safeParse({
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
      tags: ['garden', 'table'],
      attributes: { material: 'linen', dimensions: { width: '40 cm' } },
    });

    expect(result.success).toBe(true);
  });

  it('rejects price or inventory fields even when nested in flexible catalog attributes', () => {
    const result = vendorCatalogImportSchema.safeParse({
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
      attributes: { details: { unitPrice: 1250, stockCount: 6 } },
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-HTTPS catalog source and attachment URLs', () => {
    const catalogResult = vendorCatalogImportSchema.safeParse({
      source: 'vendor-feed',
      externalId: 'item-17',
      title: 'Garden table centerpiece',
      category: 'Decor',
      sourceUrl: 'http://vendor.example/item-17',
    });
    const metadataResult = eventMetadataSchema.safeParse({
      metadata: {},
      attachments: [{ name: 'Brief', url: 'javascript:alert(1)' }],
    });

    expect(catalogResult.success).toBe(false);
    expect(metadataResult.success).toBe(false);
  });

  it('rejects prices, availability, and booking state in event metadata', () => {
    const result = eventMetadataSchema.safeParse({
      metadata: { programNotes: 'Doors open at 9', bookingStatus: 'CONFIRMED' },
      attachments: [],
    });

    expect(result.success).toBe(false);
  });

  it('limits flexible documents to 16 KB', () => {
    const result = eventMetadataSchema.safeParse({
      metadata: { notes: '\u0800'.repeat(6_000) },
      attachments: [],
    });

    expect(result.success).toBe(false);
  });
});
