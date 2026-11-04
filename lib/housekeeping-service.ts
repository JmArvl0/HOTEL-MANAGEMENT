import {z} from "zod";
export const serviceConditionSchema=z.object({action:z.enum(["set","clear"]),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().uuid()}).strict();
export const housekeepingDndSchema=z.object({taskId:z.string().min(1).max(100),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().uuid()}).strict();
export const housekeepingServiceOutcomeSchema=z.object({outcome:z.enum(["service_declined","late_service"]),note:z.string().trim().min(3).max(500),expectedVersion:z.number().int().positive(),idempotencyKey:z.string().uuid()}).strict();
export type ReservationServiceCondition={reservationId:string;dndActive:boolean;setAt:string|null;reason:string|null;version:number|null};
