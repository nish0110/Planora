import { z } from 'zod';
export const createEventSchema = z.object({
  eventName: z.string().trim().min(3).max(180),
  description: z.string().max(5000).optional().nullable(),
  eventType: z.string().trim().min(2).max(80),
  location: z.string().max(500).optional().nullable(),
  startDatetime: z.string().datetime({offset:true}),
  endDatetime: z.string().datetime({offset:true}),
  expectedAttendees: z.coerce.number().int().min(0).max(1000000).default(0),
  totalBudget: z.coerce.number().min(0).max(1000000000).default(0),
}).refine(d => new Date(d.endDatetime) > new Date(d.startDatetime), { path:['endDatetime'], message:'End time must be after start time.' });
export const createAllocationSchema = z.object({
  eventId: z.coerce.number().int().positive(), resourceId: z.coerce.number().int().positive(),
  allocatedBy: z.coerce.number().int().positive().optional(), startDatetime: z.string().datetime({offset:true}),
  endDatetime: z.string().datetime({offset:true}), quantity: z.coerce.number().int().positive().max(10000).default(1),
  totalCost: z.coerce.number().min(0).max(1000000000).default(0),
}).refine(d => new Date(d.endDatetime) > new Date(d.startDatetime), { path:['endDatetime'], message:'End time must be after start time.' });

export const updateEventSchema = z.object({
  eventName: z.string().trim().min(3).max(180).optional(),
  description: z.string().max(5000).optional().nullable(),
  eventType: z.string().trim().min(2).max(80).optional(),
  location: z.string().max(500).optional().nullable(),
  startDatetime: z.string().datetime({offset:true}).optional(),
  endDatetime: z.string().datetime({offset:true}).optional(),
  expectedAttendees: z.coerce.number().int().min(0).max(1000000).optional(),
  totalBudget: z.coerce.number().min(0).max(1000000000).optional(),
  status: z.enum(['PLANNING', 'CONFIRMED', 'COMPLETED']).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })
  .refine((value) => !value.startDatetime || !value.endDatetime || new Date(value.endDatetime) > new Date(value.startDatetime), {
    path: ['endDatetime'], message: 'End time must be after start time.',
  });
