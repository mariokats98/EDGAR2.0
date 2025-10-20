// lib/auth.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email"; // or whatever you use
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    // swap/add Google/GitHub/etc. if you use them
    EmailProvider({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user?.email) {
        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true, role: true },
        });

        // attach a couple of useful fields for the UI
        (session as any).userId = user?.id ?? null;
        (session as any).role = user?.role ?? "FREE";
        (session as any).isPro = (user?.role === "PRO");
      }
      return session;
    },
    async signIn({ user }) {
      if (!user?.email) return false;

      // ensure the user record exists
      await prisma.user.upsert({
        where: { email: user.email },
        create: { email: user.email, role: "FREE" },
        update: {},
      });

      return true;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };