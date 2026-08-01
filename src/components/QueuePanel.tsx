import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChevronDownIcon, ChevronUpIcon, LinkIcon, PlayIcon, TrashIcon } from "./Icons";

type QueueItem = { id: Id<"queueItems">; videoId: string; title: string; url: string; position: number };
type HistoryItem = { id: Id<"playHistory">; videoId: string; title: string; url: string; playedAtMs: number };

function parseYouTubeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    let videoId = "";
    if (url.hostname === "youtu.be") videoId = url.pathname.slice(1).split("/")[0];
    else if (url.hostname.endsWith("youtube.com")) {
      videoId = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
  } catch {
    return null;
  }
}

export function QueuePanel({ roomId, queue, history }: { roomId: string; queue: QueueItem[]; history: HistoryItem[] }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const enqueue = useMutation(api.player.enqueue);
  const removeQueued = useMutation(api.player.removeQueued);
  const moveQueued = useMutation(api.player.moveQueued);
  const clearQueue = useMutation(api.player.clearQueue);
  const replayHistory = useMutation(api.player.replayHistory);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      setError("請貼上有效的 YouTube、youtu.be 或 Shorts 網址");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await enqueue({ roomId, ...parsed, title: `YouTube · ${parsed.videoId}` });
      setUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <div className="panel-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">UP NEXT</p>
            <h2 className="text-xl font-black">播放清單 <span className="text-zinc-500">{queue.length}</span></h2>
          </div>
          {queue.length > 0 && <button className="text-button" onClick={() => clearQueue({ roomId })}>清空</button>}
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
          <label className="relative min-w-0 flex-1">
            <LinkIcon className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
            <input
              className="url-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputMode="url"
              placeholder="貼上 YouTube 影片網址"
              aria-label="YouTube 影片網址"
            />
          </label>
          <button className="add-button" disabled={busy}>{busy ? "加入中…" : "加入播放"}</button>
        </form>
        {error && <p className="mt-2 text-sm font-semibold text-red-300">{error}</p>}
        <div className="mt-4 space-y-2">
          {queue.length === 0 ? (
            <EmptyState text="目前沒有新點播，播完後會從歷史紀錄自動接續。" />
          ) : queue.map((item, index) => (
            <article className="queue-row" key={item.id}>
              <img src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`} alt="" className="h-14 w-24 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.title}</p>
                <p className="text-xs text-zinc-500">#{index + 1} · {item.videoId}</p>
              </div>
              <div className="flex gap-1">
                <button className="mini-button" onClick={() => moveQueued({ roomId, itemId: item.id, direction: "up" })} disabled={index === 0} aria-label="往上移"><ChevronUpIcon /></button>
                <button className="mini-button" onClick={() => moveQueued({ roomId, itemId: item.id, direction: "down" })} disabled={index === queue.length - 1} aria-label="往下移"><ChevronDownIcon /></button>
                <button className="mini-button danger" onClick={() => removeQueued({ roomId, itemId: item.id })} aria-label="移除"><TrashIcon /></button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <p className="eyebrow">AUTOPILOT</p>
        <h2 className="text-xl font-black">播放紀錄</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-400">沒有新連結時，播放端會從這裡自動接著播放。</p>
        <div className="mt-4 space-y-2">
          {history.length === 0 ? <EmptyState text="播放過的影片會出現在這裡。" /> : history.map((item) => (
            <article className="queue-row" key={item.id}>
              <img src={`https://i.ytimg.com/vi/${item.videoId}/default.jpg`} alt="" className="size-14 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.title}</p>
                <p className="text-xs text-zinc-500">{new Date(item.playedAtMs).toLocaleString("zh-TW")}</p>
              </div>
              <button className="mini-button accent" onClick={() => replayHistory({ roomId, historyId: item.id })} aria-label="立即播放"><PlayIcon /></button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-700 px-5 py-8 text-center text-sm leading-6 text-zinc-500">{text}</div>;
}
