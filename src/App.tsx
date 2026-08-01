import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../convex/_generated/api";
import { Controls } from "./components/Controls";
import { PhoneIcon, TvIcon } from "./components/Icons";
import { PlayerStage } from "./components/PlayerStage";
import { QueuePanel } from "./components/QueuePanel";

type View = "home" | "player" | "remote";

function currentRoute(): { view: View; roomId: string | null } {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  return {
    view: rawView === "player" || rawView === "remote" ? rawView : "home",
    roomId: params.get("room"),
  };
}

function navigate(view: View, roomId?: string) {
  const url = new URL(window.location.href);
  url.search = "";
  if (view !== "home") url.searchParams.set("view", view);
  if (roomId) url.searchParams.set("room", roomId);
  window.location.href = url.toString();
}

export default function App() {
  const route = currentRoute();
  if (route.view === "home") return <Home />;
  if (route.view === "player") return <PlayerView roomFromUrl={route.roomId} />;
  return <RemoteView roomId={route.roomId} />;
}

function Home() {
  return (
    <main className="min-h-dvh bg-zinc-950 px-5 py-10 text-zinc-100 sm:grid sm:place-items-center">
      <section className="mx-auto max-w-5xl">
        <p className="eyebrow">QUEUECAST</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[.95] tracking-[-.05em] sm:text-7xl">把大螢幕變成<br /><span className="text-red-500">共享點歌台。</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">播放端建立專屬房間與 QR code，手機掃一下即可加入播放清單、排序與遙控所有播放功能。</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <button className="role-card group" onClick={() => navigate("player")}>
            <span className="role-icon bg-red-600"><TvIcon /></span><span><strong>開啟播放端</strong><small>產生新房間與 QR code</small></span><span className="arrow">→</span>
          </button>
          <button className="role-card group" onClick={() => navigate("remote")}>
            <span className="role-icon bg-violet-600"><PhoneIcon /></span><span><strong>開啟操控端</strong><small>輸入房間代碼或掃描 QR</small></span><span className="arrow">→</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function PlayerView({ roomFromUrl }: { roomFromUrl: string | null }) {
  const roomId = useMemo(() => roomFromUrl ?? crypto.randomUUID(), [roomFromUrl]);
  const initializeRoom = useMutation(api.player.initializeRoom);
  const room = useQuery(api.player.getRoom, { roomId });

  useEffect(() => {
    if (!roomFromUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      window.history.replaceState(null, "", url);
    }
    void initializeRoom({ roomId });
  }, [initializeRoom, roomFromUrl, roomId]);

  const remoteUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "remote");
    url.searchParams.set("room", roomId);
    return url.toString();
  }, [roomId]);

  if (room === undefined || room === null) return <Loading label="正在建立播放房間…" />;

  return (
    <main className="min-h-dvh bg-zinc-950 p-4 text-zinc-100 sm:p-6">
      <div className="mx-auto max-w-[1500px]">
        <Header roomId={roomId} label="播放端" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <PlayerStage roomId={roomId} videoId={room.currentVideoId} title={room.currentTitle} isPlaying={room.isPlaying} volume={room.volume} positionSeconds={room.positionSeconds} seekVersion={room.seekVersion} />
            <Controls roomId={roomId} isPlaying={room.isPlaying} volume={room.volume} positionSeconds={room.positionSeconds} durationSeconds={room.durationSeconds} disabled={!room.currentVideoId} />
          </div>
          <aside className="qr-card">
            <p className="eyebrow">SCAN TO CONTROL</p>
            <h2 className="mt-2 text-2xl font-black">手機掃描連接</h2>
            <div className="mx-auto mt-5 w-fit rounded-3xl bg-white p-4 shadow-[0_0_50px_rgba(255,255,255,.12)]"><QRCodeSVG value={remoteUrl} size={210} level="M" /></div>
            <p className="mt-5 text-center text-sm text-zinc-400">房間代碼</p>
            <button className="mt-2 w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 font-mono text-sm font-bold tracking-wider" onClick={() => navigator.clipboard.writeText(remoteUrl)}>{roomId}</button>
            <p className="mt-3 text-center text-xs leading-5 text-zinc-500">觸碰代碼可複製操控連結</p>
          </aside>
        </div>
        <div className="mt-5"><QueuePanel roomId={roomId} queue={room.queue} history={room.history} /></div>
      </div>
    </main>
  );
}

function RemoteView({ roomId }: { roomId: string | null }) {
  const [input, setInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const room = useQuery(api.player.getRoom, roomId ? { roomId } : "skip");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  if (!roomId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-zinc-950 p-5 text-zinc-100">
        <form className="panel-card w-full max-w-md" onSubmit={(event) => { event.preventDefault(); if (input.trim()) navigate("remote", input.trim()); }}>
          <p className="eyebrow">JOIN A PLAYER</p><h1 className="mt-2 text-3xl font-black">連接播放端</h1><p className="mt-3 leading-7 text-zinc-400">建議直接掃描播放畫面的 QR code，或在下方貼上房間代碼。</p>
          <input className="url-input mt-6 pl-4" value={input} onChange={(event) => setInput(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <button className="add-button mt-3 w-full">加入房間</button>
        </form>
      </main>
    );
  }
  if (room === undefined) return <Loading label="正在連接播放端…" />;
  if (room === null) return <MissingRoom roomId={roomId} />;

  const online = now - room.playerHeartbeatAtMs < 15000;
  return (
    <main className="min-h-dvh bg-zinc-950 p-4 pb-10 text-zinc-100 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <Header roomId={roomId} label="手機操控端" online={online} />
        <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/15 bg-zinc-900">
          <div className="grid gap-5 p-5 sm:grid-cols-[180px_1fr] sm:items-center">
            {room.currentVideoId ? <img src={`https://i.ytimg.com/vi/${room.currentVideoId}/mqdefault.jpg`} alt="目前播放影片縮圖" className="aspect-video w-full rounded-2xl object-cover sm:aspect-square" /> : <div className="grid aspect-video place-items-center rounded-2xl bg-zinc-800 text-sm text-zinc-500 sm:aspect-square">尚未點播</div>}
            <div className="min-w-0"><p className="eyebrow">NOW PLAYING</p><h1 className="mt-2 truncate text-2xl font-black sm:text-4xl">{room.currentTitle ?? "等待第一支影片"}</h1><p className="mt-2 text-sm text-zinc-500">{room.isPlaying ? "播放中" : "已暫停"} · {Math.floor(room.positionSeconds / 60)}:{String(Math.floor(room.positionSeconds % 60)).padStart(2, "0")}</p></div>
          </div>
          <div className="border-t border-zinc-700 p-4"><Controls roomId={roomId} isPlaying={room.isPlaying} volume={room.volume} positionSeconds={room.positionSeconds} durationSeconds={room.durationSeconds} disabled={!room.currentVideoId} /></div>
        </section>
        <div className="mt-5"><QueuePanel roomId={roomId} queue={room.queue} history={room.history} /></div>
      </div>
    </main>
  );
}

function Header({ roomId, label, online = true }: { roomId: string; label: string; online?: boolean }) {
  return <header className="flex flex-wrap items-center justify-between gap-3"><button onClick={() => navigate("home")} className="text-xl font-black tracking-tight">Queue<span className="text-red-500">Cast</span></button><div className="flex items-center gap-3"><span className={`status-pill ${online ? "online" : "offline"}`}><i />{online ? "播放端在線" : "等待播放端"}</span><span className="hidden text-xs text-zinc-500 sm:inline">{label} · {roomId.slice(0, 8)}</span></div></header>;
}

function Loading({ label }: { label: string }) {
  return <main className="grid min-h-dvh place-items-center bg-zinc-950 text-zinc-100"><div className="text-center"><div className="mx-auto size-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-500" /><p className="mt-4 font-bold">{label}</p></div></main>;
}

function MissingRoom({ roomId }: { roomId: string }) {
  return <main className="grid min-h-dvh place-items-center bg-zinc-950 p-5 text-zinc-100"><section className="panel-card max-w-lg text-center"><p className="eyebrow">ROOM NOT FOUND</p><h1 className="mt-2 text-3xl font-black">這個房間尚未開啟</h1><p className="mt-3 leading-7 text-zinc-400">請確認播放端仍開著，或重新掃描畫面上的 QR code。</p><p className="mt-4 break-all font-mono text-xs text-zinc-600">{roomId}</p><button className="add-button mt-6" onClick={() => navigate("home")}>回到首頁</button></section></main>;
}
