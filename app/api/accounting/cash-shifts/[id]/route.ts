import{NextResponse}from"next/server";import{z}from"zod";import{canOperateCashShift,canReconcileFinancials}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// Expected cash is always recomputed from the payments recorded against the shift. The counted
// amount is stored as a variance and never used to rewrite a guest payment.
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("close"),actualCash:z.coerce.number().min(0).max(10000000),notes:z.string().trim().max(400).optional(),idempotencyKey:z.string().uuid()}),
 z.object({action:z.literal("reconcile"),notes:z.string().trim().max(400).optional()})]);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return invalid(body.error?.issues[0]?.message??"Invalid cash shift action.");
 const action=body.data;const closing=action.action==="close"; // TEMPORARY (cash-shift defense, 2026-10-03): closing is suspended while reopen is broken — the drawer stays open. Revert when the open error is fixed. if(closing)return NextResponse.json({error:"Shift closing is temporarily suspended — the drawer stays open while the reopen error is fixed."},{status:409});
 const context=await guardFinancial(closing?canOperateCashShift:canReconcileFinancials,closing?"Cash handling access required.":"Accounting authorization required.");if(guardFailed(context))return context;
 const id=(await params).id;
 const{data,error}=action.action==="close"
  ?await context.client.rpc("accounting_close_cash_shift",{p_shift_id:id,p_actual_cash:action.actualCash,p_notes:action.notes??null,p_idempotency_key:action.idempotencyKey,p_staff_user_id:context.actorId})
  :await context.client.rpc("accounting_reconcile_cash_shift",{p_shift_id:id,p_staff_user_id:context.actorId,p_notes:action.notes??null});
 if(error){const err=error as{message:string;code?:unknown;details?:unknown;hint?:unknown};console.error("update cash shift failed",{code:typeof err.code==="string"?err.code:null,message:err.message,details:typeof err.details==="string"?err.details:null,hint:typeof err.hint==="string"?err.hint:null});return rpcFailure(error,{CASH_SHIFT_NOT_FOUND:"That cash shift no longer exists.",CASH_SHIFT_NOT_OPEN:"That cash shift is already closed.",CASH_SHIFT_NOT_CLOSED:"Close the shift before reconciling it.",VARIANCE_EXPLANATION_REQUIRED:"A variance must be explained before it can be reconciled.",INVALID_COUNTED_CASH:"The counted cash cannot be negative.",CASH_SHIFT_FORBIDDEN:"Cash handling access required.",RECONCILIATION_FORBIDDEN:"Accounting authorization required.","Could not find the function":"Cash shift service is unavailable. Ask an administrator to apply the pending migration."},"Unable to update this cash shift.");}
 return NextResponse.json({data})}
