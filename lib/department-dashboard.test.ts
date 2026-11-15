import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {demoStore} from '@/lib/demo-store';
import {getDashboard} from '@/lib/data';
import type {Resource} from '@/lib/types';

// Exercise the real supported demo-data aggregation and role projection.
// SQL/HTTP/browser acceptance covers the database-backed path separately.
vi.mock('@/lib/supabase', () => ({supabase: null}));
const resources: Resource[] = ['reservations', 'rooms', 'housekeeping_tasks', 'invoices', 'payments', 'guest_requests', 'maintenance_orders'];
const originals = new Map(resources.map(resource => [resource, demoStore[resource]]));
beforeEach(() => {
  for (const resource of resources) demoStore[resource] = [];
  demoStore.rooms = [
    {id:'R1',number:'101',status:'maintenance',housekeeping:'clean'},
    {id:'R2',number:'102',status:'maintenance',housekeeping:'clean'},
    {id:'R3',number:'103',status:'dirty',housekeeping:'dirty'},
    {id:'R4',number:'104',status:'dirty',housekeeping:'cleaning'},
    {id:'R5',number:'105',status:'dirty',housekeeping:'inspection'},
  ];
  demoStore.maintenance_orders = [
    {id:'M1',room_id:'R1',room_number:'101',status:'in_progress',serviceability_impact:'blocked',priority:'critical'},
    {id:'M2',room_id:'R1',room_number:'101',status:'in_progress',serviceability_impact:'blocked',priority:'urgent'},
    {id:'M3',room_id:'R2',room_number:'102',status:'assigned',serviceability_impact:'out_of_service',priority:'normal'},
    {id:'M4',room_id:'R3',room_number:'103',status:'resolved',serviceability_impact:'blocked',priority:'critical'},
  ];
  demoStore.guest_requests = [
    {id:'G1',department:'housekeeping',approval_status:'approved',status:'open'},
    {id:'G2',department:'maintenance',approval_status:'approved',status:'in_progress'},
    {id:'G3',department:'maintenance',approval_status:'pending',status:'open'},
  ];
  demoStore.invoices = [{id:'I1',paid:500,balance:100}];
});
afterEach(() => {for (const resource of resources) demoStore[resource] = originals.get(resource)!;});

describe('department dashboard preserves actionable operational metrics', () => {
  it('shows Maintenance its active/urgent work and unique blocked rooms', async () => {
    const {metrics} = await getDashboard('maintenance');
    expect(metrics).toMatchObject({openMaintenance:3,criticalMaintenance:2,outOfServiceRooms:2,departmentRequests:1});
    expect(metrics).toMatchObject({revenue:0,collectionsToday:0,outstandingBalances:0,occupancy:0});
  });

  it('shows Housekeeping cleaning, inspection and technical coordination without financial access', async () => {
    const {metrics} = await getDashboard('housekeeping');
    expect(metrics).toMatchObject({dirtyRooms:1,roomsCleaning:1,roomsAwaitingInspection:1,outOfServiceRooms:2,departmentRequests:1});
    expect(metrics).toMatchObject({revenue:0,collectionsToday:0,outstandingBalances:0,openMaintenance:0});
  });
});
