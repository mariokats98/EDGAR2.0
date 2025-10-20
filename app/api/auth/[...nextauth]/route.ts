// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

// NextAuth v5: expose GET and POST from handlers
export const { GET, POST } = handlers;