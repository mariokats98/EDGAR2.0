// /auth.ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
// You can add more providers later (Google, etc.)

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  // optional: set a base URL if needed
  // basePath: "/api/auth",
});