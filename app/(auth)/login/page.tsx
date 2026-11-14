import { bookingAccountContext } from "@/components/auth/booking-account-context";
import LoginForm from "@/components/auth/login-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  const booking = params.booking === "1";
  const expired = params.expired === "1";
  const recovering = params.view === "forgot-password";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}${booking ? "&booking=1" : ""}`;
  return (
    <AuthVaultShell bookingContext={booking ? await bookingAccountContext(callbackUrl) : null} mode={recovering ? "forgot-password" : "login"} callbackUrl={callbackUrl} booking={booking}>
      {recovering ? <ForgotPasswordForm loginHref={loginHref} /> : <LoginForm callbackUrl={callbackUrl} booking={booking} expired={expired} />}
    </AuthVaultShell>
  );
}
