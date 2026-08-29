import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export const authOptions: NextAuthOptions = {
  secret: env.authSecret,
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      // A project-specific name ignores stale localhost cookies that were
      // encrypted with a previous secret.
      name: env.isProduction ? "__Secure-haven.session-token" : "haven.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: env.isProduction }
    }
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const email = credentials.email.trim().toLowerCase();

        if (!supabase) return null;
        const { data } = await supabase.from("user_accounts").select("id,email,name,role,password_hash,active").eq("email", email).maybeSingle();
        if (data?.active && (await bcrypt.compare(credentials.password, data.password_hash))) {
          return { id: data.id, email: data.email, name: data.name, role: data.role as Role };
        }

        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) token.role = (user as typeof user & { role: Role }).role;
      if (trigger === "update" && typeof session?.name === "string") token.name = session.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as Role) ?? "guest";
      }
      return session;
    }
  }
};
