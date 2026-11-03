import {beforeEach,describe,expect,it,vi} from "vitest";
const boundary=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:boundary.rpc}}));
vi.mock("@/lib/auth",()=>({authOptions:{}}));
vi.mock("next-auth",()=>({getServerSession:vi.fn()}));
const{getServerSession}=await import("next-auth");
const party=await import("@/app/api/front-desk/reservations/[id]/guests/route");
const close=await import("@/app/api/accounting/night-audit/close/route");
const day=await import("@/app/api/staff/operational-date/route");
const handover=await import("@/app/api/staff/handover/route");
const quote=await import("@/app/api/front-desk/fees/quote/route");
const request=(body:unknown)=>new Request("http://haven.test/api/hotel",{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json"}});
beforeEach(()=>{vi.resetAllMocks();boundary.rpc.mockResolvedValue({data:{},error:null});});
describe("hotel operation routes keep their server actor and role boundaries",()=>{
 it("identifies missing backend functions without exposing database diagnostics",async()=>{
  vi.mocked(getServerSession).mockResolvedValue({user:{id:"actor",role:"manager"}} as never);
  boundary.rpc.mockResolvedValue({error:{code:"PGRST202",message:"Private schema detail"}});
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  try{const response=await day.GET();expect(response.status).toBe(503);const body=await response.json();expect(body.code).toBe("HOTEL_OPERATIONS_UNAVAILABLE");expect(body.error).not.toContain("Private schema detail");expect(log).toHaveBeenCalledWith("Hotel operation unavailable",{operation:"hotel_operating_day",code:"PGRST202"});}finally{log.mockRestore();}
 });
 it("ignores a forged actor in party input",async()=>{
  vi.mocked(getServerSession).mockResolvedValue({user:{id:"server-actor",role:"front_desk"}} as never);
  expect((await party.POST(request({members:[{guestId:"guest",role:"primary"}],expectedVersion:0,idempotencyKey:crypto.randomUUID(),p_actor:"forged"}),{params:Promise.resolve({id:"reservation"})})).status).toBe(200);
  expect(boundary.rpc).toHaveBeenCalledWith("hotel_party_update",expect.objectContaining({p_actor:"server-actor"}));
 });
 it.each(["front_desk","manager","owner","housekeeping","admin","guest"])("does not let %s execute financial close",async role=>{
  vi.mocked(getServerSession).mockResolvedValue({user:{id:"actor",role}} as never);
  expect((await close.POST(request({businessDate:"2026-11-03",expectedVersion:1,idempotencyKey:crypto.randomUUID()}))).status).toBe(403);expect(boundary.rpc).not.toHaveBeenCalled();
 });
 it("fails disabled sessions before every new mutation",async()=>{
  vi.mocked(getServerSession).mockResolvedValue({user:{id:"actor",role:"accounting",disabled:true}} as never);
  for(const action of [()=>day.POST(),()=>handover.POST(request({})),()=>quote.POST(request({})),()=>close.POST(request({}))])expect((await action()).status).toBe(401);
  expect(boundary.rpc).not.toHaveBeenCalled();
 });
 it.each(["STALE_OPERATING_DAY","OPERATIONS_CHANGED_RETRY"])("returns a refreshable conflict for %s without leaking database messages",async code=>{
  vi.mocked(getServerSession).mockResolvedValue({user:{id:"actor",role:"accounting"}} as never);
  boundary.rpc.mockResolvedValue({error:{message:`${code} internal context`}});
  const response=await close.POST(request({businessDate:"2026-11-03",expectedVersion:1,idempotencyKey:crypto.randomUUID()}));
  expect(response.status).toBe(409);expect((await response.json()).error).not.toContain("internal context");
 });
});
