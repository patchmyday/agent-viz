/**
 * Event buffer — accumulates ServerEvents and flushes them to the DB in batches.
 *
 * Flush triggers:
 *   - Every 100 ms (time-based), OR
 *   - When buffer reaches 500 events (size-based)
 *
 * Events are simultaneously broadcast to WebSocket subscribers via the broker.
 * The buffer is the single fan-out point between ingestion (JSONL watcher + hook receiver)
 * and persistence + real-time delivery.
 */

import type { ServerEvent } from "@agent-viz/shared-types";
import type { NewEvent } from "../db/schema.js";
import { insertEvents } from "../db/queries.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback invoked for each flushed batch — broker uses this to broadcast */
type FlushCallback = (events: ServerEvent[]) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 100;
const FLUSH_SIZE_THRESHOLD = 500;

// ---------------------------------------------------------------------------
// EventBuffer
// ---------------------------------------------------------------------------

export class EventBuffer {
  private buffer: ServerEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onFlush: FlushCallback;
  /** Per-session monotonic sequence counter */
  private sequences: Map<string, number> = new Map();

  constructor(onFlush: FlushCallback) {
    this.onFlush = onFlush;
    this.start();
  }

  /** Add one or more events to the buffer */
  push(...events: ServerEvent[]): void {
    this.buffer.push(...events);
    if (this.buffer.length >= FLUSH_SIZE_THRESHOLD) {
      this.flush();
    }
  }

  /** Get the next sequence number for a session */
  nextSeq(sessionId: string): number {
    const current = this.sequences.get(sessionId) ?? 0;
    this.sequences.set(sessionId, current + 1);
    return current;
  }

  /** Force an immediate flush */
  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    this.persist(batch);
    this.onFlush(batch);
  }

  /** Stop the timer (call on shutdown) */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush(); // drain any remaining events
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private start(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    // Don't keep the process alive just for the timer
    this.timer.unref();
  }

  private persist(events: ServerEvent[]): void {
    const rows: NewEvent[] = [];

    for (const ev of events) {
      const payloadStr = JSON.stringify(ev);
      const agentId = "agentId" in ev ? (ev as { agentId?: string }).agentId : undefined;

      // Truncation and event_blobs are handled by insertEvents in the DB layer
      rows.push({
        eventId: ev.eventId,
        sessionId: ev.sessionId,
        agentId: agentId ?? null,
        sequenceNum: ev.sequence,
        eventType: ev.type,
        timestamp: new Date(ev.timestamp).getTime(),
        payload: payloadStr,
        isTruncated: 0,
      });
    }

    try {
      insertEvents(rows);
    } catch (err) {
      console.error("[event-buffer] Failed to persist events:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _buffer: EventBuffer | null = null;

export function getBuffer(): EventBuffer {
  if (!_buffer) throw new Error("EventBuffer not initialized — call initBuffer() first");
  return _buffer;
}

export function initBuffer(onFlush: FlushCallback): EventBuffer {
  if (_buffer) _buffer.stop();
  _buffer = new EventBuffer(onFlush);
  return _buffer;
}
