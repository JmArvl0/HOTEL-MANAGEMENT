import{NextResponse}from"next/server";import{z}from"zod";import{canProcessRefund}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// Records a failed settlement attempt. The request stays retryable; nothing is marked settled or
// provider-verified, because no external refund provider is configured for this deployment.
const schema=z.object({reason:z.string().trim().min(4).max(400)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canProcessRefund,"Accounting authorization required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("A failure reason is required.");
 const{data,error}=await context.client.rpc("accounting_fail_refund",{p_refund_id:(await params).id,p_staff_user_id:context.actorId,p_reason:parsed.data.reason});
 if(error)return rpcFailure(error,{REFUND_NOT_FOUND:"That refund request no longer exists.",REFUND_ALREADY_PROCESSED:"This refund has already been settled.",REFUND_NOT_PENDING:"This refund is no longer open.",REFUND_PROCESSING_FORBIDDEN:"Accounting authorization required."},"Unable to record this refund failure.");
 return NextResponse.json({data})}
