import { supabase } from "@/lib/supabase";
import { canRequestManagerApproval, canReviewManagerApprovals } from "@/lib/permissions";
import type { RecordItem, Role } from "@/lib/types";

export const MANAGER_APPROVAL_TYPES=["room_upgrade","reservation_modification","early_check_in","late_checkout","guest_compensation","refund_exception","checkout_exception","guest_escalation"] as const;
export const MANAGER_DECISIONS=["approve","reject"] as const;
export const isFinalApproval=(status:string)=>["approved","rejected","cancelled","expired"].includes(status);
export const managerCanReview=(role:Role)=>canReviewManagerApprovals(role);
export const staffCanRequestApproval=(role:Role)=>canRequestManagerApproval(role);

export async function listManagerApprovals(role:Role,userId:string):Promise<RecordItem[]>{
 if(!supabase)return[];
 let query=supabase.from("manager_approval_requests").select("id,request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by,requested_at,status,reviewed_by,reviewed_at,decision_reason,execution_status,executed_by,executed_at,version,updated_at,authority_level,owner_escalated_by,owner_escalated_at,owner_escalation_reason,owner_reviewed_by,owner_reviewed_at");
 if(!canReviewManagerApprovals(role))query=query.eq("requested_by",userId);
 const{data,error}=await query.order("requested_at",{ascending:false});if(error)throw error;
 const rows=(data??[])as RecordItem[];const reservationIds=[...new Set(rows.map(row=>String(row.reservation_id||"")).filter(Boolean))];const userIds=[...new Set(rows.flatMap(row=>[String(row.requested_by||""),String(row.reviewed_by||"")]).filter(Boolean))];
 const[reservations,users]=await Promise.all([reservationIds.length?supabase.from("reservations").select("id,confirmation_number,guest_name,room_type,room_number,check_in,check_out,status,payment_status").in("id",reservationIds):Promise.resolve({data:[]}),userIds.length?supabase.from("user_accounts").select("id,name,role").in("id",userIds):Promise.resolve({data:[]})]);
 return rows.map(row=>{const reservation=reservations.data?.find(item=>item.id===row.reservation_id);const requester=users.data?.find(item=>item.id===row.requested_by);const reviewer=users.data?.find(item=>item.id===row.reviewed_by);return{...row,reservation_reference:reservation?.confirmation_number??row.reservation_id,guest_name:reservation?.guest_name??null,current_room_type:reservation?.room_type??null,current_room:reservation?.room_number??null,stay_dates:reservation?reservation.check_in+" to "+reservation.check_out:null,reservation_status:reservation?.status??null,requester_name:requester?.name??"Unknown",reviewer_name:reviewer?.name??null,requested_action_summary:JSON.stringify(row.requested_action??{}),policy_summary:JSON.stringify(row.normal_policy_result??{})}})as RecordItem[];
}
