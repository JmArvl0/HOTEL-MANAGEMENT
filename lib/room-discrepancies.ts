import {z} from "zod";

const key=z.string().uuid();
const version=z.number().int().nonnegative();
export const roomDiscrepancyReportSchema=z.object({
 observedOccupancy:z.enum(["occupied","vacant","uncertain"]),
 reason:z.string().trim().min(3).max(500),
 taskId:z.string().min(1).max(60).nullable().optional(),
 idempotencyKey:key,
}).strict();
export const roomDiscrepancyUpdateSchema=z.object({
 action:z.enum(["investigate","resolve"]),
 reason:z.string().trim().min(3).max(500).optional(),
 expectedVersion:version,
 idempotencyKey:key,
}).strict().superRefine((value,ctx)=>{
 if(value.action==="resolve"&&!value.reason)ctx.addIssue({code:"custom",message:"A resolution reason is required."});
});
export type RoomDiscrepancy={
 id:string;roomId:string;roomNumber:string;taskId:string|null;reservationId:string|null;
 observedOccupancy:"occupied"|"vacant"|"uncertain";systemSnapshot:Record<string,unknown>;
 reason:string;status:"open"|"investigating";reportedAt:string;reporter:string|null;
 investigatorId:string|null;investigatedAt:string|null;resolutionReason:string|null;
 handoverId:string;version:number;
};
export type RoomDiscrepancyList={assessedAt:string;items:RoomDiscrepancy[]};
