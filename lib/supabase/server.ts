import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const INDIGO_SUPABASE_URL = "https://yqninaripblwhcfcwwnr.supabase.co";
const INDIGO_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zlhSNpfeS3gjBDPsxOPiCQ_DYkKwgb_";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || INDIGO_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || INDIGO_SUPABASE_PUBLISHABLE_KEY;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; session refresh can happen elsewhere.
        }
      },
    },
  });
}
