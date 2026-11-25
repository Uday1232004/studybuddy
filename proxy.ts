import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/session";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/auth/callback" ||
    request.nextUrl.pathname === "/reset-password"
  ) {
    return NextResponse.next({ request });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
