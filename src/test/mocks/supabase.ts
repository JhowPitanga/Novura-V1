import { vi } from "vitest";

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

function createMockQueryBuilder(
  resolveWith: { data: unknown; error: unknown } = { data: null, error: null }
): MockQueryBuilder {
  const builder: MockQueryBuilder = {} as MockQueryBuilder;
  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "lte",
    "like",
    "ilike",
    "order",
    "limit",
    "range",
  ] as const;

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder.single = vi.fn().mockResolvedValue(resolveWith);
  builder.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  builder.then = vi.fn().mockImplementation((resolve) => resolve(resolveWith));

  return builder;
}

export function createMockSupabaseClient() {
  const mockBuilder = createMockQueryBuilder();

  return {
    from: vi.fn().mockReturnValue(mockBuilder),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
    _mockBuilder: mockBuilder,
    _createMockQueryBuilder: createMockQueryBuilder,
  };
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
