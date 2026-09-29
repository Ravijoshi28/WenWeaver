// Keep only the most recent successful measurement per operation. These marks
// stay in the browser; no source code, credentials, or analytics leave the client.
export async function measureOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await operation();
  performance.clearMeasures(name);
  performance.measure(name, { start, end: performance.now() });
  return result;
}
