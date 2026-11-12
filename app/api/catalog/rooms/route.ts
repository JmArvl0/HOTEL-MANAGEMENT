import { NextResponse } from "next/server";import{guardCatalog,adminGuardFailed,adminRpcFailure}from"@/lib/admin-route";
import { createPhysicalRoomSchema } from "@/lib/room-configuration";
import { resolveRoomAmenities } from "@/lib/room-amenities";
// Physical-room roster and creation for Manager and above. Operational state
// (status, housekeeping) is read here for context but is never written: those
// belong to the front-desk, housekeeping, and maintenance workflows.
export async function GET(){
  const c=await guardCatalog();if(adminGuardFailed(c))return c;
  const[roomsResult,typesResult,assignmentsResult,reservationsResult,holdsResult]=await Promise.all([
    c.client.from("rooms").select("id,number,floor,type,status,housekeeping,wing,administrative_designation,administratively_active,deactivated_at,deactivation_reason,configuration_version,amenity_additions,amenity_exclusions").order("floor",{ascending:true}).order("number",{ascending:true}),
    c.client.from("room_types").select("id,name,base_rate,active,archived_at,amenities,badge_color_key").order("name",{ascending:true}),
    // One pass each for the forward commitments that block a retype, so the
    // dialog can disable the type field before the RPC has to refuse it.
    c.client.from("reservation_room_assignments").select("room_id").eq("status","active"),
    c.client.from("reservations").select("room_id").in("status",["pending","confirmed","checked_in"]).not("room_id","is",null),
    c.client.from("booking_holds").select("selected_room_id").in("status",["active","payment_submitted"]).is("reservation_id",null).gt("expires_at",new Date().toISOString()).not("selected_room_id","is",null),
  ]);
  if(roomsResult.error||typesResult.error||assignmentsResult.error||reservationsResult.error||holdsResult.error)return NextResponse.json({error:"Unable to load the physical room roster."},{status:500});
  const committed=new Map<string,number>();
  for(const row of[...(assignmentsResult.data??[]),...(reservationsResult.data??[])]){const key=String(row.room_id);committed.set(key,(committed.get(key)??0)+1);}
  for(const row of holdsResult.data??[]){const key=String(row.selected_room_id);committed.set(key,(committed.get(key)??0)+1);}
  const standards=new Map((typesResult.data??[]).map(type=>[type.name,type.amenities]));
  const data=(roomsResult.data??[]).map(room=>({...room,commitments:committed.get(String(room.id))??0,amenityDetails:resolveRoomAmenities(standards.get(room.type),room.amenity_additions,room.amenity_exclusions)}));
  return NextResponse.json({data,roomTypes:typesResult.data??[]});
}
export async function POST(request:Request){
  const c=await guardCatalog();if(adminGuardFailed(c))return c;
  const p=createPhysicalRoomSchema.safeParse(await request.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues[0]?.message??"Enter a valid room number, floor, and room type."},{status:400});
  const {data,error}=await c.client.rpc("catalog_save_room",{p_room:null,p_body:p.data,p_actor:c.actorId});
  if(error)return adminRpcFailure(error,"Unable to add the physical room.");
  return NextResponse.json({data},{status:201});
}
