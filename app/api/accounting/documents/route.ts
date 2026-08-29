import{NextResponse}from"next/server";import{z}from"zod";import{canIssueFinancialDocument}from"@/lib/permissions";import{guardFailed,guardFinancial,invalid,rpcFailure}from"@/lib/financial-route";
// Receipts and folio statements are immutable snapshots built server-side from authoritative
// records. No amount, balance or guest identity value is accepted from the client.
const schema=z.union([
 z.object({documentType:z.literal("receipt"),paymentId:z.string().uuid(),idempotencyKey:z.string().uuid()}),
 z.object({documentType:z.literal("folio"),reservationId:z.string().trim().min(1).max(64),idempotencyKey:z.string().uuid()})]);
export async function POST(request:Request){const context=await guardFinancial(canIssueFinancialDocument,"Financial document access required.");if(guardFailed(context))return context;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return invalid("A receipt requires a settled payment and a folio statement requires a reservation.");
 const{data,error}=await context.client.rpc("accounting_generate_document",{p_document_type:parsed.data.documentType,p_reservation_id:parsed.data.documentType==="folio"?parsed.data.reservationId:null,p_payment_id:parsed.data.documentType==="receipt"?parsed.data.paymentId:null,p_idempotency_key:parsed.data.idempotencyKey,p_staff_user_id:context.actorId});
 if(error)return rpcFailure(error,{PAYMENT_NOT_SETTLED:"A receipt can only be issued for a settled payment.",RESERVATION_NOT_FOUND:"That reservation no longer exists.",FOLIO_NOT_FOUND:"That reservation has no folio.",DOCUMENT_FORBIDDEN:"Financial document access required."},"Unable to generate this document.");
 return NextResponse.json({data})}
