import { publicJson } from "@/lib/server-errors";
import{z}from"zod";import{canProcessRefund}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// Records a failed settlement attempt. The request stays retryable; nothing is marked settled or
// provider-verified, because no external refund provider is configured for this deployment.
const schema=z.object({reason:z.string().trim().min(4).max(400)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canProcessRefund,"You don't have permission to perform this accounting action. Ask Accounting for help.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("Please explain why the room did not pass inspection.");
 const{data,error}=await context.client.rpc("accounting_fail_refund",{p_refund_id:(await params).id,p_staff_user_id:context.actorId,p_reason:parsed.data.reason});
 if(error)return rpcFailure(error,{REFUND_NOT_FOUND:"That refund request no longer exists.",REFUND_ALREADY_PROCESSED:"This refund has already been settled.",REFUND_NOT_PENDING:"This refund is no longer open.",REFUND_PROCESSING_FORBIDDEN:"You don't have permission to perform this accounting action. Ask Accounting for help."},"Unable to record this refund failure.");
 return publicJson({data})}
