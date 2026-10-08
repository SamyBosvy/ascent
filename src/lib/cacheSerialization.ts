/** JSON round-trip for query Maps (route statistics and habit history). */
export const serializeCache = (value: unknown): string => JSON.stringify(value, (_key, data) => data instanceof Map ? { __ascentMap: true, entries: [...data] } : data);
export const deserializeCache = (value: string): unknown => JSON.parse(value, (_key, data: unknown) => {
  if (data && typeof data === "object" && "__ascentMap" in data && "entries" in data && data.__ascentMap === true && Array.isArray(data.entries)) return new Map(data.entries);
  return data;
});