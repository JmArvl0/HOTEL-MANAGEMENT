import { requireCustomerSession } from "@/lib/customer-auth";
import { supabase } from "@/lib/supabase";
import { ProfileWithSession } from "@/components/account/account-forms";
import { AccountSecurityButton } from "@/components/account/account-security-dialog";
export default async function ProfilePage() {
 const session = await requireCustomerSession();
 const [account, guests] = supabase ? await Promise.all([supabase.from("user_accounts").select("name,email").eq("id", session.user.id).single(),supabase.from("guests").select("phone,address,nationality").eq("user_account_id",session.user.id).limit(2)]) : [{data:null,error:true},{data:null,error:true}];
 const error = account.error || guests.error ? "Unable to load your guest profile. Reload this page to try again." : (guests.data?.length??0)>1 ? "Multiple guest profiles are linked to this account. Ask Front Desk to resolve the link before editing." : null;
 const profile = guests.data?.[0];
 return <><section className="customer-page-title split"><div><h1>Your guest details.</h1><p>Keep contact information current for smoother reservations and arrivals.</p></div><AccountSecurityButton className="btn btn-soft"/></section><section className="customer-profile-card">{error?<p role="alert">{error}</p>:<ProfileWithSession session={session} defaults={{name:account.data?.name??session.user.name??"",email:account.data?.email??session.user.email??"",mobile:profile?.phone??"",address:profile?.address??"",nationality:profile?.nationality??""}}/>}</section></>;
}
