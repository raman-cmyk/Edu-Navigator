import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, pending, flush } from './offlineQueue';

/*
 * Offline writes must survive until reconnect and replay exactly once, keeping
 * any that fail (docs/03 §Offline).
 */

// jsdom isn't configured for this suite (node env); provide a tiny localStorage.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('offlineQueue', () => {
  it('queues writes and lists them', () => {
    enqueue('answer', { post_id: 'p1', body: 'hi' });
    enqueue('answer', { post_id: 'p2', body: 'yo' });
    expect(pending()).toHaveLength(2);
  });

  it('flushes successful items and keeps failures', async () => {
    enqueue('answer', { post_id: 'ok', body: 'a' });
    enqueue('answer', { post_id: 'fail', body: 'b' });
    const done = await flush(async (w) => {
      if (w.payload.post_id === 'fail') throw new Error('still offline');
    });
    expect(done).toBe(1);
    expect(pending()).toHaveLength(1);
    expect(pending()[0].payload.post_id).toBe('fail');
  });
});
