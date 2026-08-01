import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const queueItem = v.object({
  id: v.id("queueItems"),
  videoId: v.string(),
  url: v.string(),
  title: v.string(),
  position: v.number(),
});

const historyItem = v.object({
  id: v.id("playHistory"),
  videoId: v.string(),
  url: v.string(),
  title: v.string(),
  playedAtMs: v.number(),
});

const roomSnapshot = v.object({
  roomId: v.string(),
  isPlaying: v.boolean(),
  volume: v.number(),
  positionSeconds: v.number(),
  durationSeconds: v.number(),
  seekVersion: v.number(),
  currentVideoId: v.union(v.string(), v.null()),
  currentUrl: v.union(v.string(), v.null()),
  currentTitle: v.union(v.string(), v.null()),
  playerHeartbeatAtMs: v.number(),
  commandUpdatedAtMs: v.number(),
  queue: v.array(queueItem),
  history: v.array(historyItem),
});

async function getState(ctx: MutationCtx, roomId: string) {
  return await ctx.db
    .query("roomStates")
    .withIndex("by_room_id", (q) => q.eq("roomId", roomId))
    .unique();
}

function validateRoomId(roomId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) throw new Error("房間代碼格式不正確");
}

function validateVideo(videoId: string, url: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("無效的 YouTube 影片網址");
  if (!url.startsWith("https://")) throw new Error("影片網址必須使用 HTTPS");
}

async function recordCurrent(ctx: MutationCtx, state: Doc<"roomStates">) {
  if (!state.currentVideoId || !state.currentUrl || !state.currentTitle) return;
  await ctx.db.insert("playHistory", {
    roomId: state.roomId,
    videoId: state.currentVideoId,
    url: state.currentUrl,
    title: state.currentTitle,
    playedAtMs: Date.now(),
  });
}

async function playQueueItem(
  ctx: MutationCtx,
  state: Doc<"roomStates">,
  item: Doc<"queueItems">,
  isPlaying = true,
) {
  await ctx.db.patch(item._id, { status: "playing" });
  await ctx.db.patch(state._id, {
    currentQueueItemId: item._id,
    currentVideoId: item.videoId,
    currentUrl: item.url,
    currentTitle: item.title,
    positionSeconds: 0,
    durationSeconds: 0,
    seekVersion: state.seekVersion + 1,
    isPlaying,
    commandUpdatedAtMs: Date.now(),
  });
}

async function playHistoryItem(
  ctx: MutationCtx,
  state: Doc<"roomStates">,
  item: Doc<"playHistory">,
) {
  await ctx.db.patch(state._id, {
    currentQueueItemId: null,
    currentVideoId: item.videoId,
    currentUrl: item.url,
    currentTitle: item.title,
    positionSeconds: 0,
    durationSeconds: 0,
    seekVersion: state.seekVersion + 1,
    isPlaying: true,
    commandUpdatedAtMs: Date.now(),
  });
}

export const getRoom = query({
  args: { roomId: v.string() },
  returns: v.union(roomSnapshot, v.null()),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("roomStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();
    if (!state) return null;

    const queue = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .order("asc")
      .take(100);
    const history = await ctx.db
      .query("playHistory")
      .withIndex("by_room_and_played_at", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(50);

    return {
      roomId: state.roomId,
      isPlaying: state.isPlaying,
      volume: state.volume,
      positionSeconds: state.positionSeconds,
      durationSeconds: state.durationSeconds,
      seekVersion: state.seekVersion,
      currentVideoId: state.currentVideoId,
      currentUrl: state.currentUrl,
      currentTitle: state.currentTitle,
      playerHeartbeatAtMs: state.playerHeartbeatAtMs,
      commandUpdatedAtMs: state.commandUpdatedAtMs,
      queue: queue.map((item) => ({
        id: item._id,
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        position: item.position,
      })),
      history: history.map((item) => ({
        id: item._id,
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        playedAtMs: item.playedAtMs,
      })),
    };
  },
});

export const initializeRoom = mutation({
  args: { roomId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    const existing = await getState(ctx, args.roomId);
    if (!existing) {
      const now = Date.now();
      await ctx.db.insert("roomStates", {
        roomId: args.roomId,
        isPlaying: false,
        volume: 70,
        positionSeconds: 0,
        durationSeconds: 0,
        seekVersion: 0,
        currentQueueItemId: null,
        currentVideoId: null,
        currentUrl: null,
        currentTitle: null,
        playerHeartbeatAtMs: now,
        commandUpdatedAtMs: now,
      });
    }
    return null;
  },
});

export const enqueue = mutation({
  args: { roomId: v.string(), videoId: v.string(), url: v.string(), title: v.string() },
  returns: v.id("queueItems"),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    validateVideo(args.videoId, args.url);
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間，請重新掃描 QR code");
    const last = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .order("desc")
      .take(1);
    const id = await ctx.db.insert("queueItems", {
      roomId: args.roomId,
      videoId: args.videoId,
      url: args.url,
      title: args.title.trim().slice(0, 120) || `YouTube · ${args.videoId}`,
      status: state.currentVideoId ? "queued" : "playing",
      position: (last[0]?.position ?? Date.now()) + 1,
      addedAtMs: Date.now(),
    });
    if (!state.currentVideoId) {
      await ctx.db.patch(state._id, {
        currentQueueItemId: id,
        currentVideoId: args.videoId,
        currentUrl: args.url,
        currentTitle: args.title.trim().slice(0, 120) || `YouTube · ${args.videoId}`,
        positionSeconds: 0,
        durationSeconds: 0,
        seekVersion: state.seekVersion + 1,
        isPlaying: true,
        commandUpdatedAtMs: Date.now(),
      });
    }
    return id;
  },
});

export const setPlaying = mutation({
  args: { roomId: v.string(), isPlaying: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間");
    await ctx.db.patch(state._id, { isPlaying: args.isPlaying, commandUpdatedAtMs: Date.now() });
    return null;
  },
});

export const seek = mutation({
  args: { roomId: v.string(), positionSeconds: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間");
    await ctx.db.patch(state._id, {
      positionSeconds: Math.max(0, args.positionSeconds),
      seekVersion: state.seekVersion + 1,
      commandUpdatedAtMs: Date.now(),
    });
    return null;
  },
});

export const setVolume = mutation({
  args: { roomId: v.string(), volume: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間");
    await ctx.db.patch(state._id, {
      volume: Math.max(0, Math.min(100, Math.round(args.volume))),
      commandUpdatedAtMs: Date.now(),
    });
    return null;
  },
});

export const reportProgress = mutation({
  args: { roomId: v.string(), positionSeconds: v.number(), durationSeconds: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) return null;
    await ctx.db.patch(state._id, {
      positionSeconds: Math.max(0, args.positionSeconds),
      durationSeconds: Math.max(0, args.durationSeconds),
      playerHeartbeatAtMs: Date.now(),
    });
    return null;
  },
});

export const advance = mutation({
  args: { roomId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間");
    await recordCurrent(ctx, state);
    if (state.currentQueueItemId) {
      await ctx.db.patch(state.currentQueueItemId, { status: "played", playedAtMs: Date.now() });
    }
    const next = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .order("asc")
      .take(1);
    if (next[0]) {
      await playQueueItem(ctx, state, next[0]);
      return null;
    }
    const history = await ctx.db
      .query("playHistory")
      .withIndex("by_room_and_played_at", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(50);
    const fallback = history.find((item) => item.videoId !== state.currentVideoId) ?? history[0];
    if (fallback) await playHistoryItem(ctx, state, fallback);
    else {
      await ctx.db.patch(state._id, {
        currentQueueItemId: null,
        currentVideoId: null,
        currentUrl: null,
        currentTitle: null,
        isPlaying: false,
        positionSeconds: 0,
        durationSeconds: 0,
        commandUpdatedAtMs: Date.now(),
      });
    }
    return null;
  },
});

export const previous = mutation({
  args: { roomId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    if (!state) throw new Error("找不到播放房間");
    const history = await ctx.db
      .query("playHistory")
      .withIndex("by_room_and_played_at", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(50);
    const target = history.find((item) => item.videoId !== state.currentVideoId);
    if (target) {
      if (state.currentQueueItemId) await ctx.db.patch(state.currentQueueItemId, { status: "queued" });
      await playHistoryItem(ctx, state, target);
    }
    return null;
  },
});

export const replayHistory = mutation({
  args: { roomId: v.string(), historyId: v.id("playHistory") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.roomId);
    const item = await ctx.db.get(args.historyId);
    if (!state || !item || item.roomId !== args.roomId) throw new Error("找不到播放紀錄");
    if (state.currentQueueItemId) await ctx.db.patch(state.currentQueueItemId, { status: "queued" });
    await playHistoryItem(ctx, state, item);
    return null;
  },
});

export const removeQueued = mutation({
  args: { roomId: v.string(), itemId: v.id("queueItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.roomId !== args.roomId || item.status !== "queued") return null;
    await ctx.db.patch(item._id, { status: "removed" });
    return null;
  },
});

export const moveQueued = mutation({
  args: {
    roomId: v.string(),
    itemId: v.id("queueItems"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .order("asc")
      .take(100);
    const index = items.findIndex((item) => item._id === args.itemId);
    const swapIndex = args.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return null;
    const first = items[index];
    const second = items[swapIndex];
    await ctx.db.patch(first._id, { position: second.position });
    await ctx.db.patch(second._id, { position: first.position });
    return null;
  },
});

export const clearQueue = mutation({
  args: { roomId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .take(100);
    for (const item of items) await ctx.db.patch(item._id, { status: "removed" });
    return null;
  },
});
