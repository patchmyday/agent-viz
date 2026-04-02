import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/Button";

const SPEEDS = [0.5, 1, 2, 4];

export function ReplayControls() {
  const sendCommand = useSessionStore((s) => s.sendCommand);
  const maxSequence = useSessionStore((s) => s.maxSequence);
  const replayState = useUiStore((s) => s.replayState);
  const replayPosition = useUiStore((s) => s.replayPosition);
  const replaySpeed = useUiStore((s) => s.replaySpeed);
  const setReplayState = useUiStore((s) => s.setReplayState);
  const setReplayPosition = useUiStore((s) => s.setReplayPosition);
  const setReplaySpeed = useUiStore((s) => s.setReplaySpeed);

  const isLive = replayState === "live";

  function handlePlay() {
    setReplayState("playing");
    sendCommand?.({ type: "replay_control", action: "play" });
  }

  function handlePause() {
    setReplayState("paused");
    sendCommand?.({ type: "replay_control", action: "pause" });
  }

  function handleSeek(pos: number) {
    setReplayPosition(pos);
    const sequenceNumber = Math.floor((pos / 100) * maxSequence);
    sendCommand?.({ type: "replay_control", action: "seek", position: sequenceNumber });
  }

  function handleSpeed(speed: number) {
    setReplaySpeed(speed);
    sendCommand?.({ type: "replay_control", action: "set_speed", speed });
  }

  function handleGoLive() {
    setReplayState("live");
    setReplayPosition(100);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[rgba(124,58,237,0.2)]">
      {/* Play / Pause */}
      {replayState === "playing" ? (
        <Button size="icon" variant="outline" onClick={handlePause} title="Pause">
          ⏸
        </Button>
      ) : (
        <Button
          size="icon"
          variant="outline"
          onClick={handlePlay}
          disabled={isLive}
          title="Play from current position"
        >
          ▶
        </Button>
      )}

      {/* Seek scrubber */}
      <input
        type="range"
        min={0}
        max={100}
        value={replayPosition}
        onChange={(e) => handleSeek(Number(e.target.value))}
        disabled={isLive}
        className="flex-1 h-1 accent-[var(--accent-purple)] disabled:opacity-30 cursor-pointer"
        title="Seek"
      />

      {/* Speed selector */}
      <div className="flex gap-0.5">
        {SPEEDS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant="ghost"
            active={replaySpeed === s && !isLive}
            disabled={isLive}
            onClick={() => handleSpeed(s)}
            className="px-1.5 py-0.5 text-[10px]"
          >
            {s}×
          </Button>
        ))}
      </div>

      {/* Live indicator */}
      <Button
        size="sm"
        variant={isLive ? "solid" : "outline"}
        onClick={handleGoLive}
        className="shrink-0"
      >
        {isLive ? "● LIVE" : "LIVE"}
      </Button>
    </div>
  );
}
