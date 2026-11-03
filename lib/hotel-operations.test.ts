import {describe,expect,it} from "vitest";
import {partySchema,handoverSchema,closeDaySchema,feeChargeSchema} from "./hotel-operations";
describe("hotel operation request boundaries",()=>{
 it("requires exactly one staying primary and rejects repeated existing guests",()=>{
  expect(partySchema.safeParse({members:[{guestId:"a",role:"primary"},{guestId:"a",role:"accompanying"}],expectedVersion:0,idempotencyKey:crypto.randomUUID()}).success).toBe(false);
  expect(partySchema.safeParse({members:[{name:"Companion",role:"accompanying"}],expectedVersion:0,idempotencyKey:crypto.randomUUID()}).success).toBe(false);
 });
 it("separates archive from resolution and rejects an invalid due date",()=>{
  expect(handoverSchema.safeParse({text:"Follow up",assignedRole:"housekeeping",status:"open",archived:true,expectedVersion:0,idempotencyKey:crypto.randomUUID()}).success).toBe(true);
  expect(handoverSchema.safeParse({text:"Follow up",assignedRole:"housekeeping",dueAt:"invalid",expectedVersion:0,idempotencyKey:crypto.randomUUID()}).success).toBe(false);
 });
 it("requires close version and accepts no client force or pricing authority",()=>{
  expect(closeDaySchema.safeParse({businessDate:"2026-11-03",idempotencyKey:crypto.randomUUID()}).success).toBe(false);
  const fee=feeChargeSchema.parse({feeCode:"TEST",quantity:2,catalogVersion:1,idempotencyKey:crypto.randomUUID(),amount:1});
  expect("amount" in fee).toBe(false);
 });
});
