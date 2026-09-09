import{NextResponse}from"next/server";import{getAccountingLedger}from"@/lib/accounting";import{canOperateCashShift,canViewAccountingLedger}from"@/lib/permissions";import{guardFailed,guardFinancial}from"@/lib/financial-route";
// Cash-handling staff (front_desk) read the ledger too — scoped inside getAccountingLedger.
export async function GET(){const context=await guardFinancial((role)=>canViewAccountingLedger(role)||canOperateCashShift(role),"Financial access required.");if(guardFailed(context))return context;
 const ledger=await getAccountingLedger(context.role);if(!ledger)return NextResponse.json({error:"Database unavailable."},{status:503});return NextResponse.json({data:ledger,role:context.role})}
