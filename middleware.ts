import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {},
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Public pages
        const publicPaths = ["/", "/edgar", "/news", "/signin", "/subscribe", "/about", "/pricing", "/privacy", "/terms", "/cookies", "/sources", "/disclaimer"];
        if (publicPaths.some((p) => path === p || path.startsWith(p + "/"))) return true;

        // Pro-only dashboards
        const proPaths = ["/bls", "/fred", "/screener", "/congress"];
        if (proPaths.some((p) => path === p || path.startsWith(p + "/"))) {
          return !!token?.isPro; // must be Pro (and signed in)
        }

        // Default: signed in
        return !!token;
      },
    },
    pages: {
      signIn: "/signin",
    },
  }
);

// Match everything in app dir
export const config = { matcher: ["/((?!_next|.*\\.(?:svg|png|jpg|jpeg|gif|ico|css|js|map)).*)"] };