import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, VolumeIcon } from "./Icons";

type ControlsProps = {
  roomId: string;
  isPlaying: boolean;
  volume: number;
  positionSeconds: number;
  durationSeconds: number;
  disabled?: boolean;
};

export function Controls({ roomId, isPlaying, volume, positionSeconds, durationSeconds, disabled }: ControlsProps) {
  const setPlaying = useMutation(api.player.setPlaying);
  const advance = useMutation(api.player.advance);
  const previous = useMutation(api.player.previous);
  const seek = useMutation(api.player.seek);
  const setVolume = useMutation(api.player.setVolume);

  return (
    <section className="rounded-3xl border border-white/15 bg-zinc-900/90 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-center gap-3">
        <button className="touch-button secondary" onClick={() => previous({ roomId })} disabled={disabled} aria-label="上一首">
          <PreviousIcon className="size-6" />
        </button>
        <button
          className="touch-button primary size-16"
          onClick={() => setPlaying({ roomId, isPlaying: !isPlaying })}
          disabled={disabled}
          aria-label={isPlaying ? "暫停" : "播放"}
        >
          {isPlaying ? <PauseIcon className="size-7" /> : <PlayIcon className="ml-1 size-7" />}
        </button>
        <button className="touch-button secondary" onClick={() => advance({ roomId })} disabled={disabled} aria-label="下一首">
          <NextIcon className="size-6" />
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="control-slider">
          <span>快退／快轉</span>
          <input
            type="range"
            min="0"
            max={Math.max(1, durationSeconds)}
            step="5"
            value={Math.min(Math.max(1, durationSeconds), positionSeconds)}
            disabled={disabled}
            onChange={(event) => seek({ roomId, positionSeconds: Number(event.target.value) })}
          />
        </label>
        <label className="control-slider">
          <span className="inline-flex items-center gap-2"><VolumeIcon className="size-4" /> 音量 {volume}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            disabled={disabled}
            onChange={(event) => setVolume({ roomId, volume: Number(event.target.value) })}
          />
        </label>
      </div>
    </section>
  );
}
