// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from "vitest";
import {cleanup,render,screen,waitFor,fireEvent,renderHook,act,within} from "@testing-library/react";
import ReservationPartyPanel from "./reservation-party-panel";
import NightAuditPanel from "./night-audit-panel";
import HotelOperationsPanel, {OperatingDateBanner} from "./hotel-operations-panel";
import {useHotelResource} from "./hotel-operations-client";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("hotel operation screens",()=>{
 it("shows operating-day failures and recovers after an explicit retry",async()=>{
  const request=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"Please contact the system administrator."})}).mockResolvedValueOnce({ok:true,json:async()=>({data:{active:true,lagging:true,businessDate:"2026-11-02",calendarDate:"2026-11-03",timezone:"Asia/Manila"}})});
  vi.stubGlobal("fetch",request);render(<OperatingDateBanner/>);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent",expect.stringContaining("Operating day unavailable"));
  fireEvent.click(screen.getByRole("button",{name:"Retry operating day"}));
  await screen.findByText(/Operating day 2026-11-02 remains open/);
  expect(screen.queryByRole("alert")).toBeNull();expect(request).toHaveBeenCalledTimes(2);
 });
 it("keeps the latest view when an older resource response arrives late",async()=>{
  const pending=new Map<string,(response:Response)=>void>();
  vi.stubGlobal("fetch",vi.fn((url:string)=>new Promise<Response>(resolve=>pending.set(url,resolve))));
  const view=renderHook(({url})=>useHotelResource<string>(url),{initialProps:{url:"/current"}});
  await waitFor(()=>expect(pending.has("/current")).toBe(true));
  view.rerender({url:"/archived"});await waitFor(()=>expect(pending.has("/archived")).toBe(true));
  await act(async()=>pending.get("/archived")!(new Response(JSON.stringify({data:"archived"}),{status:200})));
  expect(view.result.current.data).toBe("archived");
  await act(async()=>pending.get("/current")!(new Response(JSON.stringify({data:"current"}),{status:200})));
  expect(view.result.current.data).toBe("archived");
 });
 it("retains the occupant draft when another worker changes the version",async()=>{
  const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:{version:0,capacity:2,members:[{guestId:"g",name:"Guest",role:"primary"}]}})}).mockResolvedValueOnce({ok:false,json:async()=>({error:"This record changed. Refresh before editing again."})});
  vi.stubGlobal("fetch",request);render(<ReservationPartyPanel reservationId="r" editable />);
  await screen.findByText("Guest");fireEvent.change(screen.getByLabelText("Companion name"),{target:{value:"Ana"}});fireEvent.click(screen.getByRole("button",{name:"Add companion"}));
  fireEvent.click(screen.getByRole("button",{name:"Save staying guests"}));
  await screen.findByRole("alert");expect(screen.getByText("Ana")).toBeTruthy();
  expect(JSON.parse(request.mock.calls[1][1].body).expectedVersion).toBe(0);
 });
 it("sends only writable occupant fields when saving the roster",async()=>{
  const request=vi.fn()
   .mockResolvedValueOnce({ok:true,json:async()=>({data:{version:0,capacity:2,declaredCount:2,members:[{occupantId:"11111111-1111-4111-8111-111111111111",guestId:"g",name:"Guest",role:"primary",occupantType:"adult",dateOfBirth:null,nationality:null,idVerified:false,ageVerified:false,attendanceStatus:"expected",removedAt:null}]}})})
   .mockResolvedValueOnce({ok:true,json:async()=>({data:{version:1,capacity:2,declaredCount:2,members:[]}})});
  vi.stubGlobal("fetch",request);render(<ReservationPartyPanel reservationId="r" editable />);
  await screen.findByText("Guest");fireEvent.change(screen.getByLabelText("Companion name"),{target:{value:"Ana"}});fireEvent.click(screen.getByRole("button",{name:"Add companion"}));
  fireEvent.click(screen.getByRole("button",{name:"Save staying guests"}));
  await screen.findByText("Staying guests saved.");
  const payload=JSON.parse(request.mock.calls[1][1].body);
  expect(payload.members).toHaveLength(2);
  expect(payload.members[0]).not.toHaveProperty("idVerified");
  expect(payload.members[0]).not.toHaveProperty("ageVerified");
  expect(payload.members[0]).not.toHaveProperty("attendanceStatus");
  expect(payload.members[0]).not.toHaveProperty("removedAt");
 });
 it("lets Front Desk complete a one-person register without adding a companion",async()=>{
  const member={occupantId:"11111111-1111-4111-8111-111111111111",guestId:"g",name:"Solo guest",role:"primary",occupantType:"unknown",dateOfBirth:null,nationality:null,idVerified:false,ageVerified:false,attendanceStatus:"expected"};
  const party={version:3,status:"confirmed",capacity:1,declaredCount:1,complete:false,members:[member]};
  const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:party})}).mockResolvedValueOnce({ok:true,json:async()=>({data:{...party,version:4,complete:true,members:[{...member,occupantType:"adult"}]}})});
  vi.stubGlobal("fetch",request);render(<ReservationPartyPanel reservationId="solo" editable />);
  await screen.findByText("Solo guest");
  fireEvent.click(screen.getByRole("button",{name:"Edit staying guests"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Age group"}),{target:{value:"adult"}});
  fireEvent.click(screen.getByRole("checkbox",{name:"I confirmed this list names everyone included in the reservation."}));
  fireEvent.click(screen.getByRole("button",{name:"Save staying guests"}));
  await screen.findByText("Staying guests saved.");
  const payload=JSON.parse(request.mock.calls[1][1].body);
  expect(payload.completeRegister).toBe(true);expect(payload.expectedVersion).toBe(3);
  expect(payload.members).toHaveLength(1);expect(payload.members[0]).toMatchObject({occupantId:member.occupantId,guestId:"g",occupantType:"adult"});
 });
 it("never gives Front Desk a financial close button or financial totals",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{active:true,businessDate:"2026-11-03",version:1,blockers:[],warnings:[],metrics:null,recentCloses:[]}})}));
  render(<NightAuditPanel role="front_desk" />);await waitFor(()=>expect(screen.getByText(/2026-11-03/)).toBeTruthy());
  expect(screen.queryByRole("button",{name:"Close operating day"})).toBeNull();expect(screen.queryByText("Net receipts")).toBeNull();
 });
});

const handover = {
 id:"note-1", text:"Confirm airport pickup\nCheck the revised flight time with the driver.", status:"open",
 archived:false, assigned_role:"front_desk", assigned_user:null, due_at:"2025-11-10T08:15:00+08:00",
 reservation_id:null, room_id:null, guest_id:null, task_id:null, version:3, updated_at:"2025-11-10T08:00:00+08:00",
};
const inspection = { ...handover, id:"note-2", text:"Inspect Room 508", assigned_role:"housekeeping", due_at:null };
const audit = {
 active:true, businessDate:"2026-11-10", calendarDate:"2026-11-11", version:1, assessedAt:"2026-11-11T08:00:00+08:00",
 blockers:[{code:"UNRESOLVED_ARRIVAL"},{code:"OPEN_CASH_SHIFT"}], warnings:[{code:"PENDING_INSPECTIONS"}],
 metrics:{bookedNights:39,liveOccupiedRooms:37,capacity:58,serviceableCapacity:55,roomAccrual:2000,received:1500,refunds:0,netReceipts:1500,assessedCharges:0,adjustments:0,outstanding:500}, recentCloses:[],
};
const json = (data:unknown) => new Response(JSON.stringify({data}));
function operationsFetch(items = [handover,inspection], assessment = audit) {
 let current = items;
 const request = vi.fn<typeof fetch>(async (url, init) => {
  const path = String(url);
  if (path === "/api/staff/operational-date") return json({active:true,lagging:true,businessDate:"2026-11-10",calendarDate:"2026-11-11",timezone:"Asia/Manila"});
  if (path === "/api/staff/night-audit") return json(assessment);
  if (path === "/api/staff/handover?archived=false") return json({items:current.filter(item => !item.archived)});
  if (path === "/api/staff/handover?archived=true") return json({items:current.filter(item => item.archived)});
  if (path === "/api/staff/handover/assignees") return json([]);
  if (path === "/api/staff/handover/references") return json({rooms:[],reservations:[],tasks:[],guests:[]});
  if (path === "/api/staff/handover/note-1" && init?.method === "PATCH") {
   const {status} = JSON.parse(String(init.body));
   const saved = {...handover,status,version:4};
   current = current.map(item => item.id === saved.id ? saved : item);
   return json(saved);
  }
  if (path === "/api/staff/handover/note-1") return json([{created_at:"2026-11-10T06:00:00Z",actor:"Mara Lim",text:"Original note",status:"open",version:"2"}]);
  throw new Error("Unexpected request " + path);
 });
 vi.stubGlobal("fetch",request);
 return request;
}

describe("hotel operations shift briefing",()=>{
 it("groups handovers by department and expands notes inline with overdue filtering", async()=>{
  operationsFetch();
  render(<HotelOperationsPanel role="manager" />);
  const desk = await screen.findByRole("region",{name:"Front Desk"});
  expect(screen.getByRole("region",{name:"Housekeeping"})).toBeTruthy();
  const note = within(desk).getByRole("button",{name:/Confirm airport pickup/});
  expect(note.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByRole("button",{name:/^Overdue/}));
  expect(screen.queryByRole("region",{name:"Housekeeping"})).toBeNull();
  fireEvent.click(within(desk).getByRole("button",{name:/Confirm airport pickup/}));
  expect(within(desk).getByText(/revised flight time/)).toBeTruthy();
  fireEvent.click(within(desk).getByRole("button",{name:"Activity history"}));
  expect(await within(desk).findByText("Original note")).toBeTruthy();
 });

 it("keeps the handover version check when resolving an inline note", async()=>{
  const request = operationsFetch();
  render(<HotelOperationsPanel role="front_desk" />);
  fireEvent.click(await screen.findByRole("button",{name:/Confirm airport pickup/}));
  fireEvent.click(screen.getByRole("button",{name:/^Resolve$/}));
  await screen.findByRole("button",{name:"Reopen"});
  const call = request.mock.calls.find(([,init])=>init?.method==="PATCH");
  expect(call?.[0]).toBe("/api/staff/handover/note-1");
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({expectedVersion:3,status:"resolved"});
 });

 it.each(["housekeeping","maintenance"] as const)("shows %s only the scoped handover and skips the audit read", async role=>{
  const request = operationsFetch([inspection]);
  render(<HotelOperationsPanel role={role} />);
  await screen.findByRole("heading",{name:"Your shift"});
  const nav = screen.getByRole("navigation",{name:"Hotel operation views"});
  expect(within(nav).getAllByRole("button").map(button=>button.textContent)).toEqual(["Shift briefing"]);
  await screen.findByRole("button",{name:/Inspect Room 508/});
  expect(request.mock.calls.some(([path])=>path==="/api/staff/night-audit")).toBe(false);
  expect(screen.queryByText(/Open cash shift/i)).toBeNull();
 });

 it("separates live blockers and carry-forward work and hides financial totals from Front Desk", async()=>{
  operationsFetch();
  render(<HotelOperationsPanel role="front_desk" />);
  const briefing = screen.getByRole("region",{name:"Operating day briefing"});
  expect(await within(briefing).findByText("2 close blockers")).toBeTruthy();
  expect(within(briefing).getByText("Pending room inspections")).toBeTruthy();
  fireEvent.click(within(briefing).getByRole("button",{name:"Review close"}));
  expect(await screen.findByRole("heading",{name:"Required before close"})).toBeTruthy();
  expect(screen.queryByText("Net receipts")).toBeNull();
  expect(screen.queryByRole("button",{name:"Close operating day"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Identity review"})).toBeNull();
 });

 it("leaves close disabled for Accounting while a blocker remains", async()=>{
  operationsFetch();
  render(<HotelOperationsPanel role="accounting" />);
  fireEvent.click(await screen.findByRole("button",{name:"Review close"}));
  expect(await screen.findByText("Net receipts")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox",{name:/reviewed the assessment/}));
  expect((screen.getByRole("button",{name:"Close operating day"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button",{name:"Room discrepancies"})).toBeNull();
 });
});
