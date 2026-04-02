/**
 * WebSocket message handler — validates incoming ClientCommand messages
 * and dispatches to the broker or replay engine.
 *
 * Security: all incoming messages are parsed through Zod schemas.
 * Invalid messages close the connection with 1008 Policy Violation.
 */

import { z } from "zod";
import type { WebSocket } from "ws";
import { broker } from "./broker.js";
import { getSessionHistory, getSessionHistoryFrom } from "../db/queries.js";

type WS = WebSocket;

// ---------------------------------------------------------------------------
// Zod validation schemas (from SECURITY.md)
// ---------------------------------------------------------------------------

const ClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    // ULIDs are 26-char Crockford base32 — uuid() rejects them
    sessionId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  }),
  z.object({
    type: z.literal("replay_control"),
    action: z.enum(["play", "pause", "seek", "set_speed"]),
    position: z.number().int().nonnegative().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }),
  z.object({
    type: z.literal("filter"),
    showAgents: z.array(z.string().max(64)).max(100).optional(),
    eventTypes: z.array(z.string().max(64)).max(20).optional(),
  }),
]);

const MAX_MESSAGE_BYTES = 64 * 1024; // 64 KB — drop oversized messages

// ---------------------------------------------------------------------------
// Per-connection state
// ---------------------------------------------------------------------------

interface ConnState {
  sessionId?: string;
}

const connStates = new WeakMap<WS, ConnState>();

// ---------------------------------------------------------------------------
// Public API — wire these to the Hono WebSocket upgrade
// ---------------------------------------------------------------------------

export function onOpen(ws: WS): void {
  connStates.set(ws, {});
}

export function onMessage(ws: WS, rawData: string): void {
  const raw = rawData;

  if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) {
    ws.close(1008, "Message too large");
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    ws.close(1008, "Invalid JSON");
    return;
  }

  const result = ClientCommandSchema.safeParse(parsed);
  if (!result.success) {
    ws.close(1008, "Policy Violation: invalid command");
    return;
  }

  const cmd = result.data;
  const state = connStates.get(ws) ?? {};

  switch (cmd.type) {
    case "subscribe": {
      // fix 5: unsubscribe from any previous session before subscribing to the new one
      broker.unsubscribe(ws);
      state.sessionId = cmd.sessionId;
      connStates.set(ws, state);
      broker.subscribe(ws, cmd.sessionId);

      // Replay recent history so newly connected clients get context
      replayHistory(ws, cmd.sessionId);
      break;
    }

    case "replay_control": {
      // Replay control is handled per-connection.
      // For now we implement seek: send events from a given sequence position.
      if (cmd.action === "seek" && state.sessionId && cmd.position !== undefined) {
        replayFrom(ws, state.sessionId, cmd.position);
      }
      // play/pause/set_speed are UI-side concerns for the replay engine;
      // the server just acknowledges them (no-op in live mode)
      break;
    }

    case "filter": {
      broker.setFilter(ws, { showAgents: cmd.showAgents, eventTypes: cmd.eventTypes });
      break;
    }
  }
}

export function onClose(ws: WS): void {
  broker.unsubscribe(ws);
  connStates.delete(ws);
}

export function onError(ws: WS, err: Error): void {
  console.error("[ws/handler] Socket error:", err.message);
  broker.unsubscribe(ws);
  connStates.delete(ws);
}

// ---------------------------------------------------------------------------
// Internal replay helpers
// ---------------------------------------------------------------------------

/**
 * Send up to 200 most recent events to a newly subscribed client.
 */
function replayHistory(ws: WS, sessionId: string): void {
  try {
    const rows = getSessionHistory(sessionId, 200);
    if (rows.length === 0) return;

    const events = rows
      .reverse() // getSessionHistory returns DESC; send ASC
      .map((r) => {
        try { return JSON.parse(r.payload); } catch { return null; }
      })
      .filter(Boolean);

    if (events.length > 0) {
      ws.send(JSON.stringify(events));
    }
  } catch (err) {
    console.error("[ws/handler] replay history failed:", err);
  }
}

/**
 * Seek to a specific sequence position and stream events forward from there.
 */
function replayFrom(ws: WS, sessionId: string, fromSeq: number): void {
  try {
    // Use forward query — getSessionHistoryFrom returns ASC from the given position
    const rows = getSessionHistoryFrom(sessionId, 500, fromSeq);
    if (rows.length === 0) return;

    const events = rows
      .map((r) => {
        try { return JSON.parse(r.payload); } catch { return null; }
      })
      .filter(Boolean);

    if (events.length > 0) {
      ws.send(JSON.stringify(events));
    }
  } catch (err) {
    console.error("[ws/handler] replay from failed:", err);
  }
}
