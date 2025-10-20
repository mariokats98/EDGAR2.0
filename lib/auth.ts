// lib/auth.ts
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    EmailProvider({
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        // Safe fallback if RESEND_API_KEY not set yet (logs magic link to console)
        if (!process.env.RESEND_API_KEY) {
          console.log("[Herevna] Sign-in link:", { to: identifier, url });
          return;
        }
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY!);
        await resend.emails.send({
          from: "Herevna <login@herevna.io>",
          to: identifier,
          subject: "Your Herevna sign-in link",
          html: `
            <div style="font-family:Inter,system-ui,-apple-system;max-width:480px;margin:auto">
              <h2>Sign in to Herevna</h2>
              <p>Click the secure link below to sign in:</p>
              <p><a href="${url}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;border-radius:8px">Sign in</a></p>
              <p style="font-size:12px;color:#666">If you didn’t request this, ignore this email.</p>
            </div>
          `,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.isPro = (user as any).isPro ?? false;
      } else if (token?.userId) {
        const db = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { isPro: true },
        });
        token.isPro = db?.isPro ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      (session as any).isPro = token.isPro;
      return session;
    },
  },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Re-export prisma so imports from "@/lib/auth" can also get prisma
export { prisma } from "./prisma";
