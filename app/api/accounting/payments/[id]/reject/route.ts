import{NextResponse}from"next/server";import{z}from"zod";import{canVerifyDeposit}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
const schema=z.object({reason:z.string().trim().min(4).max(400)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const context=await guardFinancial(canVerifyDeposit,"Payment verification access required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("A rejection reason is required.");
 const{data,error}=await context.client.rpc("accounting_reject_deposit",{p_payment_id:(await params).id,p_staff_user_id:context.actorId,p_reason:parsed.data.reason});
 if(error)return rpcFailure(error,{PAYMENT_NOT_FOUND:"That deposit submission no longer exists.",PAYMENT_NOT_PENDING:"This deposit has already been decided.",PAYMENT_VERIFICATION_FORBIDDEN:"Payment verification access required."},"Unable to reject this deposit.");
 return NextResponse.json({data})}
