// lib/auth.ts
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // If you also use OAuth providers, add them here (e.g., Google, GitHub).
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Include password in the selection so TS knows it exists
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            password: true, // <-- must exist in your Prisma schema
          },
        });

        if (!user || !user.password) return null;

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;

        // Return object without the password
        return {
          id: user.id,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          image: user.image ?? undefined,
          // @ts-expect-error add to token in callbacks
          role: user.role,
        };
      },
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, user }) {
      // Persist role/id from user to token on sign in
      if (user) {
        token.id = user.id;
        // @ts-ignore
        if (user.role) token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        // @ts-ignore
        session.user.id = token.id as string;
        // @ts-ignore
        session.user.role = token.role as string | undefined;
      }
      return session;
    },
  },

  // Important in Vercel/production
  secret: process.env.NEXTAUTH_SECRET,
};