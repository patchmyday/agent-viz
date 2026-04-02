/**
 * WebSocket broker — maintains sessionId → Set<WebSocket> subscriptions
 * and fans out ServerEvents to all subscribers.
 */

import type { WebSocket } from "ws";
import type { ServerEvent } from "@agent-viz/shared-types";

type WS = WebSocket;

// ---------------------------------------------------------------------------
// Broker
// ---------------------------------------------------------------------------

interface SocketFilter {
  showAgents?: string[];
  eventTypes?: string[];
}

function applyFilter(events: ServerEvent[], filter: SocketFilter): ServerEvent[] {
  return events.filter((ev) => {
    if (filter.eventTypes && !filter.eventTypes.includes(ev.type)) return false;
    if (filter.showAgents) {
      const agentId = "agentId" in ev ? (ev as { agentId?: string }).agentId : undefined;
      if (agentId && !filter.showAgents.includes(agentId)) return false;
    }
    return true;
  });
}

export class WsBroker {
  /** sessionId → set of connected sockets subscribed to that session */
  private subscriptions: Map<string, Set<WS>> = new Map();
  /** socket → set of session IDs it is subscribed to (for cleanup on disconnect) */
  private socketSessions: Map<WS, Set<string>> = new Map();
  /** per-socket filter state set by the `filter` ClientCommand */
  private socketFilters: Map<WS, SocketFilter> = new Map();

  /**
   * Subscribe a socket to a session.
   * Idempotent — calling multiple times for the same pair is safe.
   */
  subscribe(ws: WS, sessionId: string): void {
    let subs = this.subscriptions.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(sessionId, subs);
    }
    subs.add(ws);

    let sessions = this.socketSessions.get(ws);
    if (!sessions) {
      sessions = new Set();
      this.socketSessions.set(ws, sessions);
    }
    sessions.add(sessionId);
  }

  /** Set (or clear) the event filter for a socket. Called by the `filter` ClientCommand. */
  setFilter(ws: WS, filter: SocketFilter): void {
    this.socketFilters.set(ws, filter);
  }

  /**
   * Remove a socket from all session subscriptions.
   * Call this when the socket disconnects.
   */
  unsubscribe(ws: WS): void {
    const sessions = this.socketSessions.get(ws);
    if (!sessions) return;

    for (const sessionId of sessions) {
      const subs = this.subscriptions.get(sessionId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) this.subscriptions.delete(sessionId);
      }
    }

    this.socketSessions.delete(ws);
    this.socketFilters.delete(ws);
  }

  /**
   * Broadcast one or more events to all sockets subscribed to the event's session.
   * Sockets that fail to receive are removed.
   */
  broadcast(events: ServerEvent[]): void {
    // Group events by sessionId to minimise Map lookups
    const bySession = new Map<string, ServerEvent[]>();
    for (const ev of events) {
      let arr = bySession.get(ev.sessionId);
      if (!arr) {
        arr = [];
        bySession.set(ev.sessionId, arr);
      }
      arr.push(ev);
    }

    for (const [sessionId, sessionEvents] of bySession) {
      const subs = this.subscriptions.get(sessionId);
      if (!subs || subs.size === 0) continue;

      const dead: WS[] = [];

      for (const ws of subs) {
        try {
          const filter = this.socketFilters.get(ws);
          const toSend = filter ? applyFilter(sessionEvents, filter) : sessionEvents;
          if (toSend.length > 0) ws.send(JSON.stringify(toSend));
        } catch {
          dead.push(ws);
        }
      }

      for (const ws of dead) {
        this.unsubscribe(ws);
      }
    }
  }

  /** Number of unique subscribed sockets */
  get connectionCount(): number {
    return this.socketSessions.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const broker = new WsBroker();
