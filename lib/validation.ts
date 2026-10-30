import { z } from 'zod';
export const createEventSchema = z.object({
  organizerId: z.coerce.number().int().positive(),
  eventName: z.string().trim().min(3).max(180),
  description: z.string().max(5000).optional().nullable(),
  eventType: z.string().trim().min(2).max(80),
  location: z.string().max(500).optional().nullable(),
  startDatetime: z.string().datetime({offset:true}),
  endDatetime: z.string().datetime({offset:true}),
  expectedAttendees: z.coerce.number().int().min(1).max(1000000),
  totalBudget: z.coerce.number().min(0).max(1000000000).default(0),
}).refine(d => new Date(d.endDatetime) > new Date(d.startDatetime), { path:['endDatetime'], message:'End time must be after start time.' });
export const createAllocationSchema = z.object({
  eventId: z.coerce.number().int().positive(), resourceId: z.coerce.number().int().positive(),
  allocatedBy: z.coerce.number().int().positive(), startDatetime: z.string().datetime({offset:true}),
  endDatetime: z.string().datetime({offset:true}), quantity: z.coerce.number().int().positive().max(10000).default(1),
  totalCost: z.coerce.number().min(0).max(1000000000).default(0),
}).refine(d => new Date(d.endDatetime) > new Date(d.startDatetime), { path:['endDatetime'], message:'End time must be after start time.' });
