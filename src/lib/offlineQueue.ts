/*
 * Offline write queue (docs/03 §Offline). Writes made while offline are queued
 * and replayed on reconnect, so a student on a flaky Kathmandu connection never
 * loses an answer they typed. Persisted in localStorage so it survives a reload.
 *
 * Kept generic and pure-ish (only localStorage) so it's unit-testable. The app
 * registers a replay handler; `flush` calls it per item and drops the ones that
 * succeed, keeping the rest for the next reconnect.
 */

export interface QueuedWrite {
  id: string;
  kind: 'answer';
  payload: Record<string, unknown>;
  queued_at: string;
}

const KEY = 'baato_write_queue';

function read(): QueuedWrite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedWrite[];
  } catch {
    return [];
  }
}

function write(items: QueuedWrite[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueue(kind: QueuedWrite['kind'], payload: Record<string, unknown>): QueuedWrite {
  const item: QueuedWrite = {
    id: `q-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    payload,
    queued_at: new Date().toISOString(),
  };
  write([...read(), item]);
  return item;
}

export function pending(): QueuedWrite[] {
  return read();
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Replay each queued write through `handler`. Items whose handler resolves are
 * removed; items that throw are kept for the next attempt. Returns the count
 * successfully flushed.
 */
export async function flush(handler: (w: QueuedWrite) => Promise<void>): Promise<number> {
  const items = read();
  const remaining: QueuedWrite[] = [];
  let done = 0;
  for (const item of items) {
    try {
      await handler(item);
      done += 1;
    } catch {
      remaining.push(item); // keep for next reconnect
    }
  }
  write(remaining);
  return done;
}
