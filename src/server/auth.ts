import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { allowedDomain, isAllowedGoogleAccount } from "@/server/access";
import { hasPermission, type Permission } from "@/server/permissions";

// Sign-in rules (SPEC.md §4): Google only, @pettyhomes.com only, and the person must be on the
// team list (invited or active) in Admin → Users & roles. Everyone else is turned away.
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { hd: allowedDomain(), prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!isAllowedGoogleAccount(profile as Parameters<typeof isAllowedGoogleAccount>[0])) return false;
      const email = profile!.email!.toLowerCase();
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.status === "DISABLED") return false;
      await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", lastLoginAt: new Date() } });
      await db.activityLog.create({ data: { userId: user.id, action: "sign_in", entity: "user", entityId: user.id, summary: `${user.name} signed in` } });
      return true;
    },
    async jwt({ token }) {
      // Re-read the user on every request so role changes and removals take effect right away.
      if (!token.email) return token;
      const user = await db.user.findUnique({ where: { email: token.email.toLowerCase() }, include: { role: true } });
      if (!user || user.status === "DISABLED") return { ...token, uid: undefined, perms: [], role: undefined };
      return { ...token, uid: user.id, name: user.name, role: user.role.name, perms: user.role.permissions, owner: user.isOwner };
    },
    async session({ session, token }) {
      return {
        ...session,
        user: { ...session.user, id: token.uid, name: token.name, role: token.role, permissions: token.perms ?? [], isOwner: !!token.owner },
      };
    },
  },
};

export type SessionUser = { id: string; name: string; email: string; role: string; permissions: string[]; isOwner: boolean };

/** Use at the top of every server page/action. Sends signed-out or removed users to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const u = session?.user as Partial<SessionUser> | undefined;
  if (!u?.id || !u.email) redirect("/login");
  return { id: u.id, name: u.name ?? "", email: u.email, role: u.role ?? "", permissions: u.permissions ?? [], isOwner: !!u.isOwner };
}

/** Throws unless the signed-in user has the permission. */
export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, perm)) throw new Error("Not allowed");
  return user;
}
