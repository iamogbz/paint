export function deepCopy<T>(obj: T): T {
  return obj && JSON.parse(JSON.stringify(obj));
}

export function memoise<T extends (...args) => any>(fn: T) {
  const resultMap = new Map<string, ReturnType<typeof fn>>();

  function cachedFunction(
    ...args: Parameters<typeof fn>
  ): ReturnType<typeof fn> {
    const key = JSON.stringify(args);
    if (resultMap.has(key)) {
      return resultMap.get(key)!;
    } else {
      const result = fn(...args);
      resultMap.set(key, result);
      return result;
    }
  }

  const clearCache = () => resultMap.clear();
  cachedFunction["clearCache"] = clearCache;
  return cachedFunction as typeof fn & { clearCache: typeof clearCache };
}
