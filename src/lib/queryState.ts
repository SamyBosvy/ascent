/** First error from a query that has no data to show. A failed background refetch keeps its cached data and is not blocking. */
export function blockingError(...queries: [error: unknown, data: unknown][]): Error | null {
  for (const [error, data] of queries) if (error && data === undefined) return error instanceof Error ? error : new Error(String(error));
  return null;
}
