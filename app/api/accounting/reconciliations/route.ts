import { publicJson } from "@/lib/server-errors";
import { validationMessage } from "@/lib/errors";
import { calendarDate, pesoAmount } from "@/lib/input-validation";
import{z}from"zod";import{canReconcileFinancials}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// settledAmount is the operator-entered figure from an external statement. It is recorded as a
// manual reconciliation input only - it never marks a payment settled or provider-verified.
const schema=z.object({periodStart:calendarDate,periodEnd:calendarDate,method:z.string().trim().min(2).max(40),settledAmount:pesoAmount(0, 1000000000),notes:z.string().trim().max(400).optional(),idempotencyKey:z.string().uuid()});
export async function POST(request:Request){const context=await guardFinancial(canReconcileFinancials,"You don't have permission to perform this accounting action. Ask Accounting for help.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid(validationMessage(parsed.error));
 const{data,error}=await context.client.rpc("accounting_reconcile_payments",{p_period_start:parsed.data.periodStart,p_period_end:parsed.data.periodEnd,p_method:parsed.data.method,p_settled_amount:parsed.data.settledAmount,p_notes:parsed.data.notes??null,p_idempotency_key:parsed.data.idempotencyKey,p_staff_user_id:context.actorId});
 if(error)return rpcFailure(error,{INVALID_RECONCILIATION_PERIOD:"The reconciliation period is invalid.",PAYMENT_METHOD_REQUIRED:"A payment method is required.",INVALID_SETTLED_AMOUNT:"The settled amount cannot be negative.",VARIANCE_EXPLANATION_REQUIRED:"A variance must be explained before it can be recorded.",RECONCILIATION_FORBIDDEN:"You don't have permission to perform this accounting action. Ask Accounting for help."},"Unable to record this reconciliation.");
 return publicJson({data})}
