// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  // If you also use OAuth providers, add them here.
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Basic input guard
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        // Pull the user including password hash
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,          // enum from your Prisma schema (e.g., USER | ADMIN)
            password: true,      // make sure your Prisma schema has this field
          },
        });

        if (!user?.password) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Return a user object WITHOUT the password
        const { password: _pw, ...safe } = user;
        return safe as Omit<typeof user, "password">;
      },
    }),
  ],

  pages: {
    signIn: "/signin", // adjust if your sign-in route differs
  },

  callbacks: {
    // Put the role on the token
    async jwt({ token, user }) {
      if (user) {
        const u = user as Pick<User, "id" | "role"> & { email?: string | null };
        token.id = u.id;
        token.role = u.role;
      }
      return token;
    },
    // Expose role/id on the session
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as User["role"];
      }
      return session;
    },
  },
};