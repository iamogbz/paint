export function deepCopy<T>(obj: T): T {
  return obj && JSON.parse(JSON.stringify(obj));
}
