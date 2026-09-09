import{NextResponse}from"next/server";import{z}from"zod";import{canVerifyDeposit}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";import{notifyWithOptionalEmail}from"@/lib/notifications";
const schema=z.object({reason:z.string().trim().min(4).max(400)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canVerifyDeposit,"Payment verification access required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("A rejection reason is required.");
 const{data,error}=await context.client.rpc("accounting_reject_deposit",{p_payment_id:(await params).id,p_staff_user_id:context.actorId,p_reason:parsed.data.reason});
 if(error)return rpcFailure(error,{PAYMENT_NOT_FOUND:"That deposit submission no longer exists.",PAYMENT_NOT_PENDING:"This deposit has already been decided.",PAYMENT_VERIFICATION_FORBIDDEN:"Payment verification access required."},"Unable to reject this deposit.");
 // Side channel: the guest needs to know their proof was declined — the website
 // reservation was just cancelled by this decision.
 const result=data as{reservationId?:string;reason?:string}|null;
 if(result?.reservationId){const{data:reservation}=await context.client.from("reservations").select("id,user_id,confirmation_number,guest_email,room_type").eq("id",result.reservationId).maybeSingle();
  if(reservation?.user_id)void notifyWithOptionalEmail({userId:reservation.user_id,type:"deposit_rejected",title:"Deposit could not be verified",detail:`${reservation.room_type} — ${reservation.confirmation_number}`,href:"/account/payments"},reservation.guest_email,{subject:"Your deposit could not be verified",heading:"We could not verify your deposit",bodyHtml:`<p>Our accounting team could not verify the deposit proof for reservation <strong>${reservation.confirmation_number}</strong>.</p><p><em>Reason: ${result.reason}</em></p><p>The reservation has been cancelled. You can book again from the Haven website.</p>`});}
 return NextResponse.json({data})}
