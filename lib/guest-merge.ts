import {z} from "zod";

export const guestMergeFields=["name","first_name","last_name","email","phone","nationality","address","preferences","special_requests"] as const;
const fieldChoicesSchema=z.object({
 name:z.enum(["source","survivor"]),first_name:z.enum(["source","survivor"]),last_name:z.enum(["source","survivor"]),
 email:z.enum(["source","survivor"]),phone:z.enum(["source","survivor"]),nationality:z.enum(["source","survivor"]),
 address:z.enum(["source","survivor"]),preferences:z.enum(["source","survivor"]),special_requests:z.enum(["source","survivor"]),
}).strict();
const guestMergeIdentitySchema=z.object({sourceId:z.string().trim().min(1).max(100),survivorId:z.string().trim().min(1).max(100)}).strict();
export const guestMergePreviewSchema=guestMergeIdentitySchema.refine(v=>v.sourceId!==v.survivorId,{message:"Choose two different guest profiles."});
export const guestMergeCommitSchema=guestMergeIdentitySchema.extend({
 fieldChoices:fieldChoicesSchema,reason:z.string().trim().min(3).max(1000),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),idempotencyKey:z.string().uuid(),
}).strict().refine(v=>v.sourceId!==v.survivorId,{message:"Choose two different guest profiles."});

export type GuestMergeField=typeof guestMergeFields[number];
export type GuestMergePreview={
 source:{id:string;name:string;email:string|null;phone:string|null};
 survivor:{id:string;name:string;email:string|null;phone:string|null};
 fields:Record<GuestMergeField,{source:string|null;survivor:string|null}>;
 referenceCounts:Record<string,{source:number;survivor:number}>;
 activeFlags:{source:number;survivor:number};canMerge:boolean;blockingReasons:string[];fingerprint:string;reviewDecision:string|null;
};
export type GuestMergeFieldChoices=Record<GuestMergeField,"source"|"survivor">;
