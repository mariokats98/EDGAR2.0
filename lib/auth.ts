// auth.ts (at project root)
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Example provider; add the ones you actually use
// import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Add real providers here
  providers: [
    // GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token?.sub) (session.user as any).id = token.sub;
      return session;
    }
  }
});