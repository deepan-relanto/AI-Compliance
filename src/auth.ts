import { getMicrosoftAuthConfig } from "@/lib/auth-config";
import { isRelantoEmail } from "@/lib/auth-env";
import { getSql } from "@/lib/db";
import {
  ensureUserForSignIn,
  getUserByEmail,
  toAuthUser,
} from "@/lib/services/auth-user-db-service";
import type { AuthUser } from "@/lib/types";
import NextAuth from "next-auth";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";

const { clientId, clientSecret, tenantId, secret, isConfigured } =
  getMicrosoftAuthConfig();

if (!isConfigured) {
  console.warn(
    "[auth] Missing AUTH_AZURE_AD_* or AUTH_SECRET — Microsoft sign-in disabled.",
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret,
  providers: isConfigured
    ? [
        MicrosoftEntraId({
          clientId: clientId!,
          clientSecret: clientSecret!,
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
          authorization: {
            params: {
              scope: "openid profile email User.Read",
            },
          },
        }),
      ]
    : [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !isRelantoEmail(email)) {
        return false;
      }
      try {
        const sql = getSql();
        const dbUser = await ensureUserForSignIn(
          sql,
          email,
          user.name ?? user.email,
        );
        return dbUser != null;
      } catch {
        return false;
      }
    },
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const email = user.email.trim().toLowerCase();
        try {
          const sql = getSql();
          const dbUser =
            (await getUserByEmail(sql, email)) ??
            (await ensureUserForSignIn(sql, email, user.name ?? user.email));
          if (dbUser) {
            const authUser = toAuthUser(dbUser);
            token.email = authUser.username;
            token.role = authUser.role;
            token.batchId = authUser.batchId;
            token.displayName = authUser.displayName;
          }
        } catch {
          /* keep token without app claims */
        }
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      const base = baseUrl.replace(/\/$/, "");
      if (url.startsWith("/")) return `${base}${url}`;
      try {
        const target = new URL(url);
        if (target.origin === new URL(base).origin) return url;
      } catch {
        /* ignore malformed url */
      }
      return base;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.role = token.role as AuthUser["role"] | undefined;
        session.user.batchId = token.batchId as string | undefined;
        session.user.displayName = token.displayName as string | undefined;
      }
      return session;
    },
  },
});

/** For login page diagnostics (dev-friendly, no secrets). */
export function getAuthSetupHint() {
  const cfg = getMicrosoftAuthConfig();
  if (!cfg.isConfigured) {
    return "Server auth is not configured. Set AUTH_SECRET and Azure AD variables in .env, then restart the dev server.";
  }
  return null;
}
