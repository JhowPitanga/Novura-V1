// Deno types for Supabase Edge Functions
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };

  // Web APIs available in Deno
  const fetch: typeof globalThis.fetch;
  const Response: typeof globalThis.Response;
  const Request: typeof globalThis.Request;
  const Headers: typeof globalThis.Headers;
  const URL: typeof globalThis.URL;
  const URLSearchParams: typeof globalThis.URLSearchParams;
  const console: typeof globalThis.console;
  const crypto: typeof globalThis.crypto;
  const setTimeout: typeof globalThis.setTimeout;
  const clearTimeout: typeof globalThis.clearTimeout;
  const setInterval: typeof globalThis.setInterval;
  const clearInterval: typeof globalThis.clearInterval;
  const JSON: typeof globalThis.JSON;
  const Math: typeof globalThis.Math;
  const Date: typeof globalThis.Date;
  const Number: typeof globalThis.Number;
  const Boolean: typeof globalThis.Boolean;
  const Array: typeof globalThis.Array;
  const Promise: typeof globalThis.Promise;
  const Set: typeof globalThis.Set;
  const Map: typeof globalThis.Map;
  const encodeURIComponent: typeof globalThis.encodeURIComponent;
  const decodeURIComponent: typeof globalThis.decodeURIComponent;
  const isNaN: typeof globalThis.isNaN;
  const isFinite: typeof globalThis.isFinite;
  const parseInt: typeof globalThis.parseInt;
  const parseFloat: typeof globalThis.parseFloat;
}

export {};
