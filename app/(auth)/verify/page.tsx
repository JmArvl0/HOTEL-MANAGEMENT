import VerifyForm from "@/components/auth/verify-form";
import { AuthVaultShell } from "@/components/auth/auth-vault-shell";
import { safeInternalPath } from "@/lib/booking";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  return (
    <AuthVaultShell mode="login" callbackUrl={callbackUrl} booking={false}>
      <VerifyForm callbackUrl={callbackUrl} />
    </AuthVaultShell>
  );
}
