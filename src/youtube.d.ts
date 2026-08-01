interface YouTubePlayer {
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface Window {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId?: string;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: (event: { target: YouTubePlayer }) => void;
          onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
          onAutoplayBlocked?: (event: { target: YouTubePlayer }) => void;
          onError?: () => void;
        };
      },
    ) => YouTubePlayer;
    PlayerState: { ENDED: number; PLAYING: number };
  };
  onYouTubeIframeAPIReady?: () => void;
}
