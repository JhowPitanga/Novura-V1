import { SUPABASE_PUBLISHABLE_KEY, supabase } from "@/integrations/supabase/client";

/** Lightweight edge function invoker shared across adapters. */
export async function invokeFn(fnName: string, body: any): Promise<{ data: any; error: any }> {
  try {
    const res = await (supabase as any).functions.invoke(fnName, {
      body,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    });
    return { data: res.data, error: res.error };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error('Invoke failed') };
  }
}
