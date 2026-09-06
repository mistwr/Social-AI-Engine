import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = form.get("mode") === "signup" ? "signup" : "login";

  if (!email || password.length < 8) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  const supabase = await createSupabaseServerClient();
  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${request.nextUrl.origin}/auth/callback` },
    });
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url), 303);
    if (!data.session) return NextResponse.redirect(new URL("/login?check-email=1", request.url), 303);
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url), 303);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
