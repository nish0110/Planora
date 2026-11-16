import { z } from 'zod';

const blockedFieldFragments = [
  'price',
  'cost',
  'amount',
  'currency',
  'availability',
  'available',
  'quantity',
  'inventory',
  'booking',
  'budget',
  'stock',
  'eventid',
  'eventname',
  'eventtype',
  'startdatetime',
  'enddatetime',
  'expectedattendees',
  'organizerid',
  'resourceid',
  'serviceid',
  'userid',
  'vendorid',
  'status',
  'location',
  'vendorname',
  'businessname',
  'contactemail',
  'email',
  'phone',
];

function containsTransactionalField(value: unknown): boolean {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const nestedValue of current) pending.push(nestedValue);
    } else if (current !== null && typeof current === 'object') {
      for (const [key, nestedValue] of Object.entries(current)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
        if (blockedFieldFragments.some((fragment) => normalizedKey.includes(fragment))) return true;
        pending.push(nestedValue);
      }
    }
  }
  return false;
}

const flexibleObjectSchema = z.record(z.unknown()).superRefine((value, context) => {
  if (containsTransactionalField(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Flexible documents cannot duplicate core identity data or transactional fields.',
    });
  }

  if (new TextEncoder().encode(JSON.stringify(value)).length > 16_384) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Flexible document data must be 16 KB or smaller.',
    });
  }
});

export const vendorCatalogImportSchema = z.object({
  vendorId: z.coerce.number().int().positive().optional(),
  source: z.string().trim().min(1).max(100),
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.string().trim().min(1).max(100),
  sourceUrl: z.string().url().max(2048).refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Source URL must use HTTPS.').optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  attributes: flexibleObjectSchema.default({}),
});

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(180),
  url: z.string().url().max(2048).refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Attachment URL must use HTTPS.'),
  description: z.string().trim().max(500).optional().default(''),
});

export const eventMetadataSchema = z.object({
  metadata: flexibleObjectSchema,
  attachments: z.array(attachmentSchema).max(25),
});
