export type DuplicateGuest={id:string;name?:string|null;email?:string|null;phone?:string|null;user_account_id?:string|null};
export type DuplicateCandidate={pairKey:string;guests:{id:string;name:string}[];reason:string;evidence:string;protected:boolean;decision:string|null};
export function duplicateCandidates(guests:DuplicateGuest[],decisions:Record<string,string>={}):DuplicateCandidate[]{
 const groups=new Map<string,DuplicateGuest[]>();
 for(const guest of guests){const email=guest.email?.trim().toLowerCase();for(const identifier of [email?`email:${email}`:null,guest.user_account_id?`account:${guest.user_account_id}`:null])if(identifier)groups.set(identifier,[...(groups.get(identifier)??[]),guest]);}
 const found=new Map<string,DuplicateCandidate>();
 for(const [identifier,group] of groups)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
  const pair=[group[i],group[j]].sort((a,b)=>a.id.localeCompare(b.id));const pairKey=pair.map(g=>g.id).join(":");
  if(found.has(pairKey))continue;
  const protectedAccounts=Boolean(pair[0].user_account_id&&pair[1].user_account_id&&pair[0].user_account_id!==pair[1].user_account_id);
  found.set(pairKey,{pairKey,guests:pair.map(g=>({id:g.id,name:g.name??"Guest"})),reason:identifier.startsWith("email:")?"Exact normalized email":"Same linked booking account",evidence:identifier.startsWith("email:")?identifier.slice(6).replace(/^(.).*(@.*)$/,"$1***$2"):"Shared account link",protected:protectedAccounts,decision:decisions[pairKey]??null});
 }
 return [...found.values()];
}
