// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
// app/api/auth/[...nextauth]/route.ts
export { handlers as GET, handlers as POST } from "@/auth";