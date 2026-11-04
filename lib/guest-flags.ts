import {z} from "zod";
const version=z.number().int().nonnegative();
const expiresAt=z.string().datetime({offset:true}).nullable();
export const guestFlagSaveSchema=z.object({
 flagType:z.enum(["vip","do_not_rent","security_alert","accessibility","special_handling"]),
 instructions:z.string().trim().min(3).max(500).nullable(),restrictedNote:z.string().trim().min(3).max(1000).nullable(),
 expiresAt,reason:z.string().trim().min(3).max(500),
}).strict().superRefine((value,ctx)=>{
 if(value.flagType==="do_not_rent"&&!value.restrictedNote)ctx.addIssue({code:"custom",message:"A restricted reason is required for a Do Not Rent flag."});
});
export const guestFlagRevokeSchema=z.object({flagId:z.string().uuid(),version,reason:z.string().trim().min(3).max(500)}).strict();
export const guestFlagOverrideSchema=z.object({flagId:z.string().uuid(),purpose:z.enum(["booking","check_in"]),flagVersion:version,
 reason:z.string().trim().min(3).max(500),expiresAt:z.string().datetime({offset:true})}).strict();
export const guestFlagOverrideRevokeSchema=z.object({version,reason:z.string().trim().min(3).max(500)}).strict();
export type GuestOperationalFlag={id:string;flagType:"vip"|"do_not_rent"|"security_alert"|"accessibility"|"special_handling";instructions:string|null;restrictedNote:string|null;expiresAt:string|null;createdAt:string;version:number};
export type GuestOperationalFlags={guestId:string;items:GuestOperationalFlag[];mayManage:boolean};
export type ReservationDnrFlag={flagId:string;guestId:string;guestName:string;flagVersion:number;restrictedNote:string;instructions:string|null;overrides:{id:string;purpose:"booking"|"check_in";expiresAt:string;version:number}[]};
