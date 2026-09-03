import LoginForm from "@/components/auth/login-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  const booking = params.booking === "1";
  return (
    <AuthVaultShell mode="login" callbackUrl={callbackUrl} booking={booking}>
      <LoginForm callbackUrl={callbackUrl} booking={booking} />
    </AuthVaultShell>
  );
}
