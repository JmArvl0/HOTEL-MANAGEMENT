import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export const authOptions: NextAuthOptions = {
  secret: env.authSecret,
  session: { strategy: "jwt" },
  cookies: { sessionToken: { name: env.isProduction ? "__Secure-haven.session-token" : "haven.session-token", options: { httpOnly: true, sameSite: "lax", path: "/", secure: env.isProduction } } },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "Credentials",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password || !supabase) return null;
      const email = credentials.email.trim().toLowerCase();
      const { data } = await supabase.from("user_accounts").select("id,email,name,role,password_hash,active,auth_version,recovery_required").eq("email", email).maybeSingle();
      if (data?.active && !data.recovery_required && (await bcrypt.compare(credentials.password, data.password_hash))) return { id: data.id, email: data.email, name: data.name, role: data.role as Role, authVersion: data.auth_version ?? 1 };
      return null;
    }
  })],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) { const signedIn=user as typeof user&{role:Role;authVersion:number};token.role=signedIn.role;token.authVersion=signedIn.authVersion;token.disabled=false; }
      else if (token.sub && supabase) {
        const { data } = await supabase.from("user_accounts").select("role,active,auth_version,recovery_required").eq("id", token.sub).maybeSingle();
        const databaseVersion = data?.auth_version ?? 1;
        if (!data?.active || data.recovery_required || token.authVersion !== databaseVersion) { token.disabled=true;token.role="guest"; }
        else { token.disabled=false;token.role=data.role as Role; }
      }
      if (trigger === "update" && typeof session?.name === "string") token.name = session.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) { session.user.id=token.sub??"";session.user.role=(token.role as Role)??"guest";session.user.disabled=Boolean(token.disabled); }
      return session;
    }
  }
};