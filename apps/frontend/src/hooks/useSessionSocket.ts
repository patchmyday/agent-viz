import { useEffect, useRef, useCallback } from "react";
import type { ClientCommand, ServerEvent } from "@agent-viz/shared-types";
import { useSessionStore } from "@/stores/sessionStore";
import { useGraphStore } from "@/stores/graphStore";
import { dispatchEvent } from "@/lib/eventMapper";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 16000;

export function useSessionSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const { setConnectionStatus, setActiveSession, setSendCommand, activeSessionId } =
    useSessionStore();

  const sendCommand = useCallback((cmd: ClientCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws`;

    setConnectionStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = RECONNECT_BASE_MS;
      setConnectionStatus("connected");
      setSendCommand(sendCommand);

      // Re-subscribe to active session after reconnect
      const { activeSessionId: sid } = useSessionStore.getState();
      if (sid) {
        ws.send(JSON.stringify({ type: "subscribe", sessionId: sid }));
      }
    };

    ws.onmessage = (msg) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return;
      }
      // Broker sends arrays of events; handle both array and single event
      const events: ServerEvent[] = Array.isArray(parsed)
        ? (parsed as ServerEvent[])
        : [parsed as ServerEvent];
      for (const event of events) {
        dispatchEvent(event);
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setConnectionStatus("disconnected");
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          RECONNECT_MAX_MS
        );
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      setConnectionStatus("error");
      ws.close();
    };
  }, [sendCommand, setConnectionStatus, setSendCommand]);

  // Subscribe to a session and reset graph state
  const subscribeToSession = useCallback(
    (sessionId: string) => {
      useGraphStore.getState().reset();
      setActiveSession(sessionId);
      sendCommand({ type: "subscribe", sessionId });
    },
    [sendCommand, setActiveSession]
  );

  // Fetch existing sessions from REST API
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: { sessions?: { sessionId: string; slug: string; cwd: string; model: string; startedAt?: string }[] }) => {
        if (data.sessions) {
          useSessionStore.getState().setSessions(data.sessions);
        }
      })
      .catch(() => {
        // Backend may not be running yet; ignore
      });
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Re-subscribe when active session changes
  useEffect(() => {
    if (activeSessionId && wsRef.current?.readyState === WebSocket.OPEN) {
      sendCommand({ type: "subscribe", sessionId: activeSessionId });
    }
  }, [activeSessionId, sendCommand]);

  return { subscribeToSession };
}
