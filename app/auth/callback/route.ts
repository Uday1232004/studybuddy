import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("://") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const loginUrl = new URL("/login?error=link", requestUrl.origin);

  if (!code) return NextResponse.redirect(loginUrl);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(loginUrl);
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
