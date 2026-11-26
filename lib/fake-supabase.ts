// Test-only stand-in for the service-role Supabase client. Not imported by any
// application module.
//
// It applies the filters the production code asks for, which is the whole point:
// if a query drops its `.eq("user_id", …)` scope, this returns the other
// customer's rows and the ownership tests fail. A mock that ignored filters would
// pass either way and prove nothing.
type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

export interface FakeSupabaseOptions {
  /** Tables on which all operations should fail (e.g., storage outage). */
  failTables?: string[];
  /** Tables on which INSERT should fail (e.g., audit write failure after read). */
  failInserts?: string[];
  failUpdates?: string[];
}

interface Builder extends PromiseLike<{ data: Row[]; error: { message: string } | null; count: number }> {
  select(...columns: unknown[]): Builder;
  returns(): Builder;
  order(...args: unknown[]): Builder;
  limit(count: number): Builder;
  /** PostgREST range: inclusive [from, to] window over the filtered+sorted rows. */
  range(from: number, to: number): Builder;
  eq(column: string, value: unknown): Builder;
  neq(column: string, value: unknown): Builder;
  not(column: string, operator: "is" | "in", value: unknown): Builder;
  in(column: string, values: unknown[]): Builder;
  is(column: string, value: unknown): Builder;
  gt(column: string, value: unknown): Builder;
  gte(column: string, value: unknown): Builder;
  lt(column: string, value: unknown): Builder;
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null; count: number }>;
  single(): Promise<{ data: Row | null; error: { message: string } | null; count: number }>;
  /** Queues a mutation applied to the filtered rows when the builder is awaited. */
  update(values: Row): Builder;
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

const failingResult = { data: null, error: { message: "storage unavailable" }, count: 0 };
const failingBuilder: Builder & { insert: (row: Row) => Builder } = {
  select: () => failingBuilder,
  returns: () => failingBuilder,
  order: () => failingBuilder,
  limit: () => failingBuilder,
  range: () => failingBuilder,
  eq: () => failingBuilder,
  neq: () => failingBuilder,
  not: () => failingBuilder,
  in: () => failingBuilder,
  is: () => failingBuilder,
  gt: () => failingBuilder,
  gte: () => failingBuilder,
  lt: () => failingBuilder,
  update: () => failingBuilder,
  insert: () => failingBuilder,
  maybeSingle: async () => ({ data: null, error: { message: "storage unavailable" }, count: 0 }),
  single: async () => ({ data: null, error: { message: "storage unavailable" }, count: 0 }),
  then: (resolve) => Promise.resolve(failingResult as unknown as { data: Row[]; error: null; count: number }).then(resolve),
};

function fieldAt(row: Row, column: string): unknown {
  let field: unknown = row;
  for (const part of column.split(".")) {
    field = typeof field === "object" && field !== null ? (field as Row)[part] : undefined;
  }
  return field;
}

function build(rows: Row[]): Builder {
  let result = [...rows];
  let pendingUpdate: Row | null = null;
  const keep = (predicate: (row: Row) => boolean) => { result = result.filter(predicate); return builder; };
  const builder: Builder = {
    select: () => builder,
    returns: () => builder,
    order: (column: unknown, options?: unknown) => {
      const key = String(column);
      const ascending = (options as { ascending?: boolean } | undefined)?.ascending !== false;
      result.sort((a, b) => (ascending ? 1 : -1) * text(a[key]).localeCompare(text(b[key])));
      return builder;
    },
    limit: (count) => { result = result.slice(0, count); return builder; },
    range: (from, to) => { result = result.slice(Math.max(0, from), to + 1); return builder; },
    eq: (column, value) => keep((row) => fieldAt(row, column) === value),
    neq: (column, value) => keep((row) => row[column] !== value),
    not: (column, operator, value) => keep((row) => operator === "is"
      ? (fieldAt(row, column) ?? null) !== value
      : !String(value).slice(1, -1).split(",").includes(String(fieldAt(row, column)))),
    in: (column, values) => keep((row) => values.includes(row[column])),
    is: (column, value) => keep((row) => (row[column] ?? null) === value),
    gt: (column, value) => keep((row) => text(row[column]) > text(value)),
    gte: (column, value) => keep((row) => text(row[column]) >= text(value)),
    lt: (column, value) => keep((row) => text(row[column]) < text(value)),
    update: (values) => { pendingUpdate = values; return builder; },
    maybeSingle: async () => ({ data: result[0] ?? null, error: null, count: result.length }),
    single: async () => ({ data: result[0] ?? null, error: null, count: result.length }),
    then: (resolve) => {
      if (pendingUpdate) {
        for (const row of result) Object.assign(row, pendingUpdate);
        return Promise.resolve({ data: null, error: null, count: result.length } as unknown as { data: Row[]; error: null; count: number }).then(resolve);
      }
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };
  return builder;
}

/** A client backed by `db`; mutate `db` between tests to change the fixture. */
export function fakeSupabase(db: FakeDb, options: FakeSupabaseOptions = {}) {
  const failTables = new Set(options.failTables ?? []);
  const failInserts = new Set(options.failInserts ?? []);
  const failUpdates = new Set(options.failUpdates ?? []);
  return {
    from: (table: string) => {
      if (failTables.has(table)) return failingBuilder;
      const rows = (db[table] ??= []);
      const builder = build(rows);
      const update = builder.update;
      return Object.assign(builder, {
        update: (values: Row) => failUpdates.has(table) ? failingBuilder : update(values),
        insert: (row: Row) => {
          if (failInserts.has(table)) {
            return failingBuilder;
          }
          rows.push(row);
          return build([row]);
        }
      });
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name !== "reserve_ai_module_interaction") return { data: null, error: null };
      if (failTables.has("ai_interactions") || failInserts.has("ai_interactions")) return { data: null, error: { message: "storage unavailable" } };
      const rows = (db.ai_interactions ??= []);
      const now = Date.now();
      const count = rows.filter((row) => row.user_id === args?.p_user_id && row.feature === "module_assistant"
        && row.module_id === args?.p_module_id && row.status !== "rate_limited"
        && new Date(String(row.created_at)).getTime() >= now - Number(args?.p_window_minutes) * 60_000).length;
      if (count >= Number(args?.p_limit)) return { data: { status: "limited" }, error: null };
      const id = `module-${rows.length + 1}`;
      rows.push({ id, user_id: args?.p_user_id, role: args?.p_role, feature: "module_assistant", module_id: args?.p_module_id,
        status: "reserved", tool_calls_used: [], created_at: new Date(now).toISOString() });
      return { data: { status: "allowed", id }, error: null };
    },
  };
}
