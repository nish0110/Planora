import { describe, expect, it } from 'vitest';
import { createEventSchema, createAllocationSchema } from '../lib/validation';
const event={organizerId:1,eventName:'Design Summit',eventType:'Conference',startDatetime:'2026-10-28T09:00:00+05:30',endDatetime:'2026-10-28T17:00:00+05:30',expectedAttendees:100,totalBudget:100000};
describe('Planora request validation',()=>{
 it('accepts a valid event',()=>{expect(createEventSchema.safeParse(event).success).toBe(true)});
 it('rejects an event whose end precedes its start',()=>{expect(createEventSchema.safeParse({...event,endDatetime:'2026-10-28T08:00:00+05:30'}).success).toBe(false)});
 it('rejects negative attendees',()=>{expect(createEventSchema.safeParse({...event,expectedAttendees:-2}).success).toBe(false)});
 it('rejects an event with zero attendees',()=>{
  expect(
    createEventSchema.safeParse({
      ...event,
      expectedAttendees: 0,
    }).success
  ).toBe(false);
 });
 it('rejects a negative event budget',()=>{
  expect(
    createEventSchema.safeParse({
      ...event,
      totalBudget: -100,
    }).success
  ).toBe(false);
 });
 it('rejects a missing event name',()=>{
  expect(
    createEventSchema.safeParse({
      ...event,
      eventName: '',
    }).success
  ).toBe(false);
 });
 it('rejects an allocation with invalid time range',()=>{expect(createAllocationSchema.safeParse({eventId:1,resourceId:1,allocatedBy:1,startDatetime:'2026-10-28T12:00:00Z',endDatetime:'2026-10-28T11:00:00Z',quantity:1,totalCost:200}).success).toBe(false)});
 it('rejects non-positive resource quantity',()=>{expect(createAllocationSchema.safeParse({eventId:1,resourceId:1,allocatedBy:1,startDatetime:'2026-10-28T10:00:00Z',endDatetime:'2026-10-28T11:00:00Z',quantity:0,totalCost:200}).success).toBe(false)});
});
