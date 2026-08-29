import{NextResponse}from"next/server";import{getAccountingLedger}from"@/lib/accounting";import{canViewAccountingLedger}from"@/lib/permissions";import{guardFailed,guardFinancial}from"@/lib/financial-route";
export async function GET(){const context=await guardFinancial(canViewAccountingLedger,"Financial access required.");if(guardFailed(context))return context;
 const ledger=await getAccountingLedger(context.role);if(!ledger)return NextResponse.json({error:"Database unavailable."},{status:503});return NextResponse.json({data:ledger,role:context.role})}
