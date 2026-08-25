import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import type { Role } from "@/lib/types";

const demoUsers: Record<string, { password: string; name: string; role: Role }> = {
  "owner@haven.test": { password: "demo123", name: "Amelia Hart", role: "owner" },
  "admin@haven.test": { password: "demo123", name: "Noah Santos", role: "admin" },
  "manager@haven.test": { password: "demo123", name: "Maya Reyes", role: "manager" },
  "frontdesk@haven.test": { password: "demo123", name: "Liam Cruz", role: "front_desk" },
  "housekeeping@haven.test": { password: "demo123", name: "Sofia Lim", role: "housekeeping" },
  "maintenance@haven.test": { password: "demo123", name: "Ethan Tan", role: "maintenance" },
  "accounting@haven.test": { password: "demo123", name: "Chloe Garcia", role: "accounting" },
  "guest@haven.test": { password: "demo123", name: "Jamie Lee", role: "guest" }
};

export const authOptions: NextAuthOptions = {
  // Keep JWT encryption stable during local development. Production still
  // requires NEXTAUTH_SECRET to be configured in Vercel.
  secret: process.env.NEXTAUTH_SECRET ?? (process.env.NODE_ENV === "development" ? "haven-local-development-secret-v1" : undefined),
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      // A project-specific name ignores stale localhost cookies that were
      // encrypted with a previous secret.
      name: process.env.NODE_ENV === "production" ? "__Secure-haven.session-token" : "haven.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" }
    }
  },  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const demo = demoUsers[credentials.email.toLowerCase()];
        if (demo && demo.password === credentials.password) return { id: credentials.email, email: credentials.email, name: demo.name, role: demo.role };
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
          const client = createClient(url, key, { auth: { persistSession: false } });
          const { data } = await client.from("app_users").select("id,email,name,role,password_hash,active").eq("email", credentials.email.toLowerCase()).maybeSingle();
          if (data?.active && await bcrypt.compare(credentials.password, data.password_hash)) return { id: data.id, email: data.email, name: data.name, role: data.role as Role };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as typeof user & { role: Role }).role;
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
