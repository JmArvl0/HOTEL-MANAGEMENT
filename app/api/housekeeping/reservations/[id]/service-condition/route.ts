import {NextResponse} from "next/server";
import {hotelGuard,hotelRpc} from "@/lib/hotel-operations-route";
import {housekeepingDndSchema} from "@/lib/housekeeping-service";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await hotelGuard(["housekeeping"]);if(context instanceof NextResponse)return context;
 const parsed=housekeepingDndSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid service instruction."},{status:400});
 const reservationId=(await params).id;
 const {data:task,error:taskError}=await context.client.from("housekeeping_tasks").select("id,room_id,reservation_id,assigned_user_id,status")
  .eq("id",parsed.data.taskId).maybeSingle();
 if(taskError)return NextResponse.json({error:"Unable to verify the assigned Housekeeping task."},{status:503});
 if(!task||!["pending","assigned","deferred","in_progress"].includes(task.status))return NextResponse.json({error:"This Housekeeping task is no longer active."},{status:409});
 if(task.assigned_user_id&&task.assigned_user_id!==context.actor)return NextResponse.json({error:"This task is assigned to another Housekeeping worker."},{status:403});
 const {data:stay,error:stayError}=await context.client.from("reservations").select("id,room_id,status").eq("id",reservationId).maybeSingle();
 if(stayError)return NextResponse.json({error:"Unable to verify the in-house stay."},{status:503});
 if(!stay||stay.status!=="checked_in"||!(task.reservation_id===stay.id||Boolean(task.room_id&&stay.room_id===task.room_id)))
  return NextResponse.json({error:"Do Not Disturb can be recorded only for an in-house guest connected to this room-care task."},{status:403});
 return hotelRpc(context,"hotel_reservation_service_condition_update",{p_reservation_id:reservationId,p_action:"set",p_reason:parsed.data.reason,p_key:parsed.data.idempotencyKey});
}
