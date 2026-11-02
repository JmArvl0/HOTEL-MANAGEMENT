type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
type Query<T> = { order(column: string): Query<T>; range(from: number, to: number): Page<T> };

/** Complete reads for totals/open work; an API response cap is not a total.
 * ponytail: loads the single property's matching history; use SQL aggregates
 * if its history becomes too large to aggregate comfortably in memory. */
export async function readAllRows<T>(build: () => Query<T>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    // Rebuild each query and append a stable ID tiebreaker to existing ordering.
    const { data, error } = await build().order("id").range(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
