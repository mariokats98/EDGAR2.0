// lib/auth.ts
import { PrismaClient } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

export const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: { email: { label: "Email", type: "text" } },
      async authorize(credentials) {
        const raw = credentials?.email || "";
        const email = raw.trim().toLowerCase();
        if (!email) return null;

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, role: "FREE" }, // role field should exist in your schema
          });
        }
        return { id: user.id, email: user.email, name: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
      }
      if (token.email) {
        const u = await prisma.user.findUnique({
          where: { email: token.email as string },
          select: { role: true, stripeCustomerId: true, id: true },
        });
        token.role = u?.role || "FREE";
        token.stripeCustomerId = u?.stripeCustomerId || null;
        token.userId = token.userId || u?.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).role = token.role;
        (session.user as any).stripeCustomerId = token.stripeCustomerId;
      }
      return session;
    },
  },
  pages: { signIn: "/signin" },
  secret: process.env.NEXTAUTH_SECRET,
};