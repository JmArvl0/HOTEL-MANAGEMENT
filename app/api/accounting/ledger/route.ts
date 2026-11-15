import { publicJson } from "@/lib/server-errors";
import{getAccountingLedger}from"@/lib/accounting";import{canOperateCashShift,canViewAccountingLedger}from"@/lib/permissions";import{guardFailed,guardFinancial}from"@/lib/financial-route";
// Cash-handling staff (front_desk) read the ledger too — scoped inside getAccountingLedger.
export async function GET(){const context=await guardFinancial((role)=>canViewAccountingLedger(role)||canOperateCashShift(role),"Financial access required.");if(guardFailed(context))return context;
 const ledger=await getAccountingLedger(context.role);if(!ledger)return publicJson({error:"This service is temporarily unavailable. Please try again shortly."},{status:503});return publicJson({data:ledger,role:context.role})}
