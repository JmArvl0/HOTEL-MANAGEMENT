import { publicJson } from "@/lib/server-errors";
import { validationMessage } from "@/lib/errors";
import { pesoAmount } from "@/lib/input-validation";
import{z}from"zod";import{canAdjustFolio}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// amount is optional: omitted reverses the remaining un-reversed portion. The amount is validated
// against the stored charge server-side, never trusted from the client.
const schema=z.object({amount:pesoAmount(0.01, 10000000).optional(),reason:z.string().trim().min(4).max(400),idempotencyKey:z.string().uuid()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canAdjustFolio,"You don't have permission to perform this accounting action. Ask Accounting for help.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid(validationMessage(parsed.error));
 const{data,error}=await context.client.rpc("accounting_reverse_charge",{p_charge_id:(await params).id,p_amount:parsed.data.amount??null,p_reason:parsed.data.reason,p_idempotency_key:parsed.data.idempotencyKey,p_staff_user_id:context.actorId});
 if(error)return rpcFailure(error,{CHARGE_NOT_FOUND:"That folio charge no longer exists.",REVERSAL_EXCEEDS_CHARGE:"A reversal cannot exceed the un-reversed portion of the charge.",CHARGE_REVERSAL_FORBIDDEN:"You don't have permission to perform this accounting action. Ask Accounting for help."},"Unable to reverse this charge.");
 return publicJson({data})}
