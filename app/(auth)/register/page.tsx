import { bookingAccountContext } from "@/components/auth/booking-account-context";
import { RegisterForm } from "@/components/auth/register-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  const booking = params.booking === "1";
  return (
    <AuthVaultShell bookingContext={booking ? await bookingAccountContext(callbackUrl) : null} mode="register" callbackUrl={callbackUrl} booking={booking}>
      <RegisterForm callbackUrl={callbackUrl} booking={booking} />
    </AuthVaultShell>
  );
}
