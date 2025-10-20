// /auth.ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// Add more providers later if you want (Google, etc.)
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  // You can set basePath if you ever change the route:
  // basePath: "/api/auth",
});