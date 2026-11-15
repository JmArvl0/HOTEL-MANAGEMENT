import { publicJson } from "@/lib/server-errors";
import { validationMessage } from "@/lib/errors";
import { pesoAmount } from "@/lib/input-validation";
import{z}from"zod";import{canAdjustFolio}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
const schema=z.object({reservationId:z.string().trim().min(1).max(64),transactionType:z.enum(["adjustment","credit","write_off"]),direction:z.enum(["debit","credit"]),amount:pesoAmount(0.01, 10000000),reason:z.string().trim().min(4).max(400),idempotencyKey:z.string().uuid()});
export async function POST(request:Request){const context=await guardFinancial(canAdjustFolio,"You don't have permission to perform this accounting action. Ask Accounting for help.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid(validationMessage(parsed.error));
 const{data,error}=await context.client.rpc("accounting_record_adjustment",{p_reservation_id:parsed.data.reservationId,p_transaction_type:parsed.data.transactionType,p_direction:parsed.data.direction,p_amount:parsed.data.amount,p_reason:parsed.data.reason,p_idempotency_key:parsed.data.idempotencyKey,p_staff_user_id:context.actorId});
 if(error)return rpcFailure(error,{RESERVATION_NOT_FOUND:"That reservation no longer exists.",FOLIO_NOT_FOUND:"That reservation has no folio.",FOLIO_CLOSED:"A cancelled folio cannot be adjusted.",ADJUSTMENT_EXCEEDS_FOLIO:"A credit cannot exceed the folio total.",WRITE_OFF_EXCEEDS_BALANCE:"A write-off cannot exceed the outstanding balance.",UNSUPPORTED_ADJUSTMENT_DIRECTION:"Credits and write-offs must reduce the folio.",ADJUSTMENT_FORBIDDEN:"You don't have permission to perform this accounting action. Ask Accounting for help."},"Unable to record this adjustment.");
 return publicJson({data})}
