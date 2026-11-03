// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from "vitest";
import {cleanup,render,screen,waitFor,fireEvent,renderHook,act} from "@testing-library/react";
import ReservationPartyPanel from "./reservation-party-panel";
import NightAuditPanel from "./night-audit-panel";
import {OperatingDateBanner} from "./hotel-operations-panel";
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
  fireEvent.click(screen.getByRole("button",{name:"Save occupants"}));
  await screen.findByRole("alert");expect(screen.getByText("Ana")).toBeTruthy();
  expect(JSON.parse(request.mock.calls[1][1].body).expectedVersion).toBe(0);
 });
 it("never gives Front Desk a financial close button or financial totals",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{active:true,businessDate:"2026-11-03",version:1,blockers:[],warnings:[],metrics:null,recentCloses:[]}})}));
  render(<NightAuditPanel role="front_desk" />);await waitFor(()=>expect(screen.getByText(/2026-11-03/)).toBeTruthy());
  expect(screen.queryByRole("button",{name:"Close operating day"})).toBeNull();expect(screen.queryByText("Net receipts")).toBeNull();
 });
});
