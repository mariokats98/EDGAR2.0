import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { Resend } from "resend";
import { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

const resend = new Resend(process.env.RESEND_API_KEY!);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    EmailProvider({
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        // Simple magic-link mail via Resend
        await resend.emails.send({
          from: "Herevna <login@herevna.io>", // set a verified domain/sender in Resend
          to: identifier,
          subject: "Your Herevna sign-in link",
          html: `
            <div style="font-family:Inter,system-ui,-apple-system;max-width:480px;margin:auto">
              <h2>Sign in to Herevna</h2>
              <p>Click the secure link below to sign in:</p>
              <p><a href="${url}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Sign in</a></p>
              <p style="font-size:12px;color:#666">If you did not request this, you can ignore this email.</p>
            </div>
          `,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // merge user flags into token
      if (user) {
        token.userId = user.id;
        token.isPro = (user as any).isPro ?? false;
      } else if (token?.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { isPro: true },
        });
        token.isPro = dbUser?.isPro ?? false;
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