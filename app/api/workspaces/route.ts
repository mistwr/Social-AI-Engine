import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return `${base || "empresa"}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const name = String(form.get("name") || "").trim().slice(0, 120);
  if (name.length < 2) {
    return NextResponse.redirect(new URL("/dashboard?error=workspace-name", request.url), 303);
  }

  const { error } = await supabase.rpc("social_ai_create_workspace", {
    p_name: name,
    p_slug: slugify(name),
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?error=${encodeURIComponent(error.message || "workspace")}`, request.url),
      303,
    );
  }

  return NextResponse.redirect(new URL("/dashboard?created=1", request.url), 303);
}
