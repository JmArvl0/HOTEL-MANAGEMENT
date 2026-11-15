import {describe,expect,it,vi} from "vitest";
import {NextResponse} from "next/server";
vi.mock("next-auth",()=>({getServerSession:async()=>({user:{id:"disabled",role:"accounting",disabled:true}})}));
vi.mock("@/lib/auth",()=>({authOptions:{}}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:vi.fn()}}));
import {guardFinancial} from "./financial-route";
describe("shared financial route guard",()=>{it("rejects disabled sessions before returning a database context",async()=>{const result=await guardFinancial(()=>true,"You don't have permission to perform this action. Ask your system administrator if you need access.");expect(result).toBeInstanceOf(NextResponse);expect((result as NextResponse).status).toBe(401);});});
