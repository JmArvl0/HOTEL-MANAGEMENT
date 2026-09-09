// Test-only stand-in for the service-role Supabase client. Not imported by any
// application module.
//
// It applies the filters the production code asks for, which is the whole point:
// if a query drops its `.eq("user_id", …)` scope, this returns the other
// customer's rows and the ownership tests fail. A mock that ignored filters would
// pass either way and prove nothing.
type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

interface Builder extends PromiseLike<{ data: Row[]; error: null; count: number }> {
  select(...columns: unknown[]): Builder;
  order(...args: unknown[]): Builder;
  limit(count: number): Builder;
  eq(column: string, value: unknown): Builder;
  neq(column: string, value: unknown): Builder;
  in(column: string, values: unknown[]): Builder;
  is(column: string, value: unknown): Builder;
  gt(column: string, value: unknown): Builder;
  gte(column: string, value: unknown): Builder;
  lt(column: string, value: unknown): Builder;
  maybeSingle(): Promise<{ data: Row | null; error: null; count: number }>;
  single(): Promise<{ data: Row | null; error: null; count: number }>;
  /** Queues a mutation applied to the filtered rows when the builder is awaited. */
  update(values: Row): Builder;
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function build(rows: Row[]): Builder {
  let result = [...rows];
  let pendingUpdate: Row | null = null;
  const keep = (predicate: (row: Row) => boolean) => { result = result.filter(predicate); return builder; };
  const builder: Builder = {
    select: () => builder,
    order: (column: unknown, options?: unknown) => {
      const key = String(column);
      const ascending = (options as { ascending?: boolean } | undefined)?.ascending !== false;
      result.sort((a, b) => (ascending ? 1 : -1) * text(a[key]).localeCompare(text(b[key])));
      return builder;
    },
    limit: (count) => { result = result.slice(0, count); return builder; },
    eq: (column, value) => keep((row) => row[column] === value),
    neq: (column, value) => keep((row) => row[column] !== value),
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
        // Supabase's update() resolves with data: null; the builder type keeps Row[] for select chains.
        return Promise.resolve({ data: null, error: null, count: result.length } as unknown as { data: Row[]; error: null; count: number }).then(resolve);
      }
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };
  return builder;
}

/** A client backed by `db`; mutate `db` between tests to change the fixture. */
export function fakeSupabase(db: FakeDb) {
  return {
    from: (table: string) => {
      const rows = (db[table] ??= []);
      const builder = build(rows);
      return Object.assign(builder, {
        insert: (row: Row) => {
          rows.push(row);
          return build([row]);
        }
      });
    },
    rpc: async () => ({ data: null, error: null }),
  };
}
