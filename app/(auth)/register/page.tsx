import { RegisterForm } from "@/components/auth/register-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  return (
    <AuthVaultShell mode="register" callbackUrl={callbackUrl} booking={params.booking === "1"}>
      <RegisterForm callbackUrl={callbackUrl} />
    </AuthVaultShell>
  );
}
