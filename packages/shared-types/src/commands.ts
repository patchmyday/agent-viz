// Client → Server command types

export type ClientCommand =
  | { type: "subscribe"; sessionId: string }
  | {
      type: "replay_control";
      action: "play" | "pause" | "seek" | "set_speed";
      position?: number;
      speed?: number;
    }
  | { type: "filter"; showAgents?: string[]; eventTypes?: string[] };
