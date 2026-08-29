import{NextResponse}from"next/server";import{z}from"zod";import{canProcessRefund}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// Settlement is operator-recorded: no external refund provider is configured, so nothing here marks
// a refund provider-verified. A failed attempt is recorded through the fail route and stays retryable.
const schema=z.object({reference:z.string().trim().min(2).max(120)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canProcessRefund,"Accounting authorization required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("A refund transaction reference is required.");
 const{data,error}=await context.client.rpc("process_refund",{p_refund_id:(await params).id,p_staff_user_id:context.actorId,p_reference:parsed.data.reference});
 if(error)return rpcFailure(error,{REFUND_EXCEEDS_RECEIVED:"A refund cannot exceed the amount actually received for this folio.",REFUND_NOT_PENDING:"This refund is no longer open for settlement.",REFUND_NOT_FOUND:"That refund request no longer exists.",REFUND_PROCESSING_FORBIDDEN:"Accounting authorization required."},"Unable to process this refund.");
 return NextResponse.json({data:data?.[0]??data??null})}
