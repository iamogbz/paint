/** Clone JSON compatible object completely */
export function deepCopy<T>(obj: T): T {
  return obj && JSON.parse(JSON.stringify(obj));
}

/** Deep clone map set */
export function copyMapSet<K, V>(o: Map<K, Set<V>>) {
  return new Map(Array.from(o).map(([k, v]) => [k, new Set(v)] as const));
}
