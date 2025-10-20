import { NextResponse, NextRequest } from "next/server";

export const config = {
  matcher: ["/bls/:path*", "/fred/:path*", "/screener/:path*", "/congress/:path*"],
};

export function middleware(req: NextRequest) {
  const isPro = req.cookies.get("isPro")?.value === "1";
  if (!isPro) {
    const url = req.nextUrl.clone();
    url.pathname = "/subscribe";
    url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}