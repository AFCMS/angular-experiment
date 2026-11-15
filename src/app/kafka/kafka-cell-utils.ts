import { from, isObservable, type Observable } from 'rxjs';
import { z } from 'zod';
import type { CompletionResult } from './kafka-cell-definition';

/** Encode bigint as exact JSON integer tokens, without converting through Number. */
export function serializeRelayJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeRelayJson).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${serializeRelayJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('This payload needs a custom relay serializer.');
}

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Check this value.';
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

export function completionObservable(result: CompletionResult): Observable<readonly string[]> {
  return isObservable(result) ? result : from(Promise.resolve(result));
}
