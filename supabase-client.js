import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export const configured =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-ANON");

// PKCE flow returns ?code=... in the query string, which keeps the URL hash free for page routing.
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
