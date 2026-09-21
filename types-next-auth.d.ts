import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/types";

declare module "next-auth" {
  interface User { role: Role; authVersion?: number; persistent?: boolean; otpPending?: boolean; challengeId?: string }
  interface Session { sessionExpiresAt?: string | null; user: { id: string; role: Role; disabled?: boolean; otpPending?: boolean } & DefaultSession["user"]; }
}
declare module "next-auth/jwt" { interface JWT { role?: Role; authVersion?: number; disabled?: boolean; persistent?: boolean; otpPending?: boolean; challengeId?: string } }
