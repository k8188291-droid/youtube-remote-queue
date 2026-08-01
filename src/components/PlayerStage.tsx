import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { PlayIcon } from "./Icons";

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

type PlayerStageProps = {
  roomId: string;
  videoId: string | null;
  title: string | null;
  isPlaying: boolean;
  volume: number;
  positionSeconds: number;
  seekVersion: number;
};

export function PlayerStage(props: PlayerStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoRef = useRef<string | null>(null);
  const lastSeekVersion = useRef(props.seekVersion);
  const [ready, setReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(true);
  const advance = useMutation(api.player.advance);
  const setPlaying = useMutation(api.player.setPlaying);
  const reportProgress = useMutation(api.player.reportProgress);

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId: props.videoId ?? undefined,
        playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: ({ target }) => {
            target.setVolume(props.volume);
            setReady(true);
          },
          onStateChange: ({ data }) => {
            if (data === window.YT?.PlayerState.ENDED) void advance({ roomId: props.roomId });
          },
          onError: () => void advance({ roomId: props.roomId }),
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !props.videoId || loadedVideoRef.current === props.videoId) return;
    loadedVideoRef.current = props.videoId;
    player.cueVideoById({ videoId: props.videoId, startSeconds: props.positionSeconds });
    setNeedsGesture(true);
  }, [props.videoId, props.positionSeconds, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !props.videoId) return;
    if (props.isPlaying && !needsGesture) player.playVideo();
    else player.pauseVideo();
  }, [props.isPlaying, props.videoId, ready, needsGesture]);

  useEffect(() => {
    playerRef.current?.setVolume(props.volume);
  }, [props.volume]);

  useEffect(() => {
    if (lastSeekVersion.current === props.seekVersion) return;
    lastSeekVersion.current = props.seekVersion;
    playerRef.current?.seekTo(props.positionSeconds, true);
  }, [props.positionSeconds, props.seekVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      void reportProgress({ roomId: props.roomId, positionSeconds: player.getCurrentTime(), durationSeconds: player.getDuration() });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [props.roomId, reportProgress]);

  async function activate() {
    setNeedsGesture(false);
    playerRef.current?.playVideo();
    await setPlaying({ roomId: props.roomId, isPlaying: true });
  }

  return (
    <section className="relative aspect-video overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-[0_30px_100px_rgba(0,0,0,.55)]">
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      {!props.videoId && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,_#3f0b20_0,_#09090b_58%)] p-8 text-center">
          <div><p className="eyebrow">READY TO CAST</p><h2 className="mt-2 text-3xl font-black sm:text-5xl">等待手機點播</h2><p className="mt-3 text-zinc-400">掃描 QR code，貼上第一支 YouTube 影片。</p></div>
        </div>
      )}
      {props.videoId && needsGesture && (
        <button className="absolute inset-0 grid w-full place-items-center bg-black/65 backdrop-blur-sm" onClick={activate}>
          <span className="flex flex-col items-center gap-4"><span className="grid size-20 place-items-center rounded-full bg-red-600 shadow-[0_0_50px_rgba(220,38,38,.55)]"><PlayIcon className="ml-1 size-9" /></span><span className="text-lg font-black">觸碰啟用播放器</span></span>
        </button>
      )}
      {props.title && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-16"><p className="truncate text-lg font-black">{props.title}</p></div>}
    </section>
  );
}
