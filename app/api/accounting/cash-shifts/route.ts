import{NextResponse}from"next/server";import{z}from"zod";import{canOperateCashShift}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
const schema=z.object({location:z.string().trim().min(2).max(80).optional(),openingAmount:z.coerce.number().min(0).max(10000000)});
export async function POST(request:Request){const context=await guardFinancial(canOperateCashShift,"Cash handling access required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid(parsed.error?.issues[0]?.message??"An opening float amount is required.");
 const{data,error}=await context.client.rpc("accounting_open_cash_shift",{p_staff_user_id:context.actorId,p_location:parsed.data.location??null,p_opening_amount:parsed.data.openingAmount});
 if(error)return rpcFailure(error,{CASH_SHIFT_ALREADY_OPEN:"You already have an open cash shift. Close it before opening another.",INVALID_OPENING_AMOUNT:"The opening float cannot be negative.",CASH_SHIFT_FORBIDDEN:"Cash handling access required."},"Unable to open a cash shift.");
 return NextResponse.json({data})}
