import { NextResponse } from "next/server";import{z}from"zod";import{guardCatalog,adminGuardFailed,adminRpcFailure}from"@/lib/admin-route";
// Physical-room roster and creation for Manager and above. Operational state
// (status, housekeeping) is read here for context but is never written: those
// belong to the front-desk, housekeeping, and maintenance workflows.
export async function GET(){
  const c=await guardCatalog();if(adminGuardFailed(c))return c;
  const[roomsResult,typesResult,assignmentsResult,reservationsResult]=await Promise.all([
    c.client.from("rooms").select("id,number,floor,type,status,housekeeping,wing,administrative_designation,administratively_active,deactivated_at,deactivation_reason,configuration_version").order("floor",{ascending:true}).order("number",{ascending:true}),
    c.client.from("room_types").select("id,name,base_rate,active").order("name",{ascending:true}),
    // One pass each for the forward commitments that block a retype, so the
    // dialog can disable the type field before the RPC has to refuse it.
    c.client.from("reservation_room_assignments").select("room_id").eq("status","active"),
    c.client.from("reservations").select("room_id").in("status",["pending","confirmed","checked_in"]).not("room_id","is",null),
  ]);
  if(roomsResult.error||typesResult.error||assignmentsResult.error||reservationsResult.error)return NextResponse.json({error:"Unable to load the physical room roster."},{status:500});
  const committed=new Map<string,number>();
  for(const row of[...(assignmentsResult.data??[]),...(reservationsResult.data??[])]){const key=String(row.room_id);committed.set(key,(committed.get(key)??0)+1);}
  const data=(roomsResult.data??[]).map(room=>({...room,commitments:committed.get(String(room.id))??0}));
  return NextResponse.json({data,roomTypes:typesResult.data??[]});
}
const createSchema=z.object({number:z.string().trim().min(1).max(20),type:z.string().trim().min(1).max(100),floor:z.coerce.number().int().min(0).max(200),wing:z.string().trim().max(80).optional(),designation:z.string().trim().max(120).optional(),active:z.boolean().optional().default(true),reason:z.string().trim().min(3).max(500)});
export async function POST(request:Request){
  const c=await guardCatalog();if(adminGuardFailed(c))return c;
  const p=createSchema.safeParse(await request.json());if(!p.success)return NextResponse.json({error:"Enter a valid room number, floor, room type, and reason."},{status:400});
  const v=p.data,{data,error}=await c.client.rpc("admin_create_room",{p_number:v.number,p_type:v.type,p_floor:v.floor,p_wing:v.wing??null,p_designation:v.designation??null,p_active:v.active,p_reason:v.reason,p_actor_user_id:c.actorId});
  if(error)return adminRpcFailure(error,"Unable to add the physical room.");
  return NextResponse.json({data},{status:201});
}
