import { bookingAccountContext } from "@/components/auth/booking-account-context";
import LoginForm from "@/components/auth/login-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  const booking = params.booking === "1";
  const expired = params.expired === "1";
  return (
    <AuthVaultShell bookingContext={params.booking === "1" ? await bookingAccountContext(callbackUrl) : null} mode="login" callbackUrl={callbackUrl} booking={booking}>
      <LoginForm callbackUrl={callbackUrl} booking={booking} expired={expired} />
    </AuthVaultShell>
  );
}
