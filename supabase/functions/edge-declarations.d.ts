declare module "https://deno.land/std@0.224.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): Promise<void>;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: unknown
  ): unknown;
}

