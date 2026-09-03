import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/types";

declare module "next-auth" {
  interface User { role: Role; authVersion?: number }
  interface Session { user: { id: string; role: Role; disabled?: boolean } & DefaultSession["user"]; }
}
declare module "next-auth/jwt" { interface JWT { role?: Role; authVersion?: number; disabled?: boolean } }