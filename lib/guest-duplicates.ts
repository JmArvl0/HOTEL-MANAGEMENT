export type DuplicateGuest={id:string;name?:string|null;email?:string|null;phone?:string|null;user_account_id?:string|null;merged_into_guest_id?:string|null};
export type DuplicateCandidate={pairKey:string;guests:{id:string;name:string}[];reason:string;evidence:string;protected:boolean;decision:string|null};
export function duplicateCandidates(guests:DuplicateGuest[],decisions:Record<string,string>={}):DuplicateCandidate[]{
 const groups=new Map<string,DuplicateGuest[]>();
 for(const guest of guests){if(guest.merged_into_guest_id)continue;const email=guest.email?.trim().toLowerCase(),phone=guest.phone?.replace(/\D/g,"");for(const identifier of [email?`email:${email}`:null,phone&&phone.length>=7?`phone:${phone}`:null,guest.user_account_id?`account:${guest.user_account_id}`:null])if(identifier)groups.set(identifier,[...(groups.get(identifier)??[]),guest]);}
 const found=new Map<string,DuplicateCandidate>();
 for(const [identifier,group] of groups)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
  const pair=[group[i],group[j]].sort((a,b)=>a.id.localeCompare(b.id));const pairKey=pair.map(g=>g.id).join(":");
  if(found.has(pairKey))continue;
  const protectedAccounts=pair.some(guest=>Boolean(guest.user_account_id));
  const email=identifier.startsWith("email:"),phone=identifier.startsWith("phone:");
  const evidence=email?identifier.slice(6).replace(/^(.).*(@.*)$/,"$1***$2"):phone?`Phone ending ${identifier.slice(-4).padStart(identifier.length,"*")}`:"Shared account link";
  found.set(pairKey,{pairKey,guests:pair.map(g=>({id:g.id,name:g.name??"Guest"})),reason:email?"Exact normalized email":phone?"Exact normalized phone":"Same linked booking account",evidence,protected:protectedAccounts,decision:decisions[pairKey]??null});
 }
 return [...found.values()];
}
