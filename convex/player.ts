import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
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

function fallbackTitle(videoId: string) {
  return `YouTube · ${videoId}`;
}

function needsTitle(videoId: string, title: string) {
  return title === videoId || title === fallbackTitle(videoId);
}

async function fetchYouTubeTitle(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const metadata = (await response.json()) as { title?: unknown };
    if (typeof metadata.title !== "string") return null;
    return metadata.title.trim().slice(0, 120) || null;
  } catch {
    return null;
  }
}

export const getYouTubeTitle = action({
  args: { videoId: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(args.videoId)) throw new Error("無效的 YouTube 影片網址");
    return (await fetchYouTubeTitle(args.videoId)) ?? fallbackTitle(args.videoId);
  },
});

export const getQueueItemForTitle = internalQuery({
  args: { roomId: v.string(), itemId: v.id("queueItems") },
  returns: v.union(v.object({ videoId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.roomId !== args.roomId || !needsTitle(item.videoId, item.title)) return null;
    return { videoId: item.videoId };
  },
});

export const listTitleBackfillCandidates = internalQuery({
  args: { roomId: v.string(), limit: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit)));
    const state = await ctx.db
      .query("roomStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();
    if (!state) return [];

    const queued = await ctx.db
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
      .take(200);
    const candidates = new Set<string>();

    if (
      state.currentVideoId &&
      state.currentTitle &&
      needsTitle(state.currentVideoId, state.currentTitle)
    ) {
      candidates.add(state.currentVideoId);
    }
    for (const item of queued) {
      if (needsTitle(item.videoId, item.title)) candidates.add(item.videoId);
      if (candidates.size >= limit) break;
    }
    if (candidates.size < limit) {
      for (const item of history) {
        if (needsTitle(item.videoId, item.title)) candidates.add(item.videoId);
        if (candidates.size >= limit) break;
      }
    }
    return Array.from(candidates).slice(0, limit);
  },
});

export const applyYouTubeTitle = internalMutation({
  args: { roomId: v.string(), videoId: v.string(), title: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    const title = args.title.trim().slice(0, 120);
    if (!title || !/^[A-Za-z0-9_-]{11}$/.test(args.videoId)) return 0;
    const state = await getState(ctx, args.roomId);
    if (!state) return 0;
    let updated = 0;

    if (state.currentVideoId === args.videoId && state.currentTitle !== title) {
      await ctx.db.patch(state._id, { currentTitle: title });
      updated += 1;
    }
    if (state.currentQueueItemId) {
      const currentItem = await ctx.db.get(state.currentQueueItemId);
      if (currentItem?.videoId === args.videoId && currentItem.title !== title) {
        await ctx.db.patch(currentItem._id, { title });
        updated += 1;
      }
    }
    const queued = await ctx.db
      .query("queueItems")
      .withIndex("by_room_and_status_and_position", (q) =>
        q.eq("roomId", args.roomId).eq("status", "queued"),
      )
      .take(100);
    for (const item of queued) {
      if (item.videoId === args.videoId && item.title !== title) {
        await ctx.db.patch(item._id, { title });
        updated += 1;
      }
    }
    const history = await ctx.db
      .query("playHistory")
      .withIndex("by_room_and_video_id", (q) =>
        q.eq("roomId", args.roomId).eq("videoId", args.videoId),
      )
      .take(100);
    for (const item of history) {
      if (item.title !== title) {
        await ctx.db.patch(item._id, { title });
        updated += 1;
      }
    }
    return updated;
  },
});

export const refreshYouTubeTitle = action({
  args: { roomId: v.string(), itemId: v.id("queueItems") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const item: { videoId: string } | null = await ctx.runQuery(
      internal.player.getQueueItemForTitle,
      args,
    );
    if (!item) return false;
    const title = await fetchYouTubeTitle(item.videoId);
    if (!title) return false;
    const updated: number = await ctx.runMutation(internal.player.applyYouTubeTitle, {
      roomId: args.roomId,
      videoId: item.videoId,
      title,
    });
    return updated > 0;
  },
});

export const backfillYouTubeTitles = internalAction({
  args: { roomId: v.string(), limit: v.optional(v.number()) },
  returns: v.object({ requested: v.number(), updated: v.number(), unresolved: v.number() }),
  handler: async (ctx, args): Promise<{ requested: number; updated: number; unresolved: number }> => {
    const candidates: string[] = await ctx.runQuery(internal.player.listTitleBackfillCandidates, {
      roomId: args.roomId,
      limit: args.limit ?? 25,
    });
    let updated = 0;
    let unresolved = 0;

    for (const videoId of candidates) {
      const title = await fetchYouTubeTitle(videoId);
      if (!title) {
        unresolved += 1;
        continue;
      }
      const changed = await ctx.runMutation(internal.player.applyYouTubeTitle, {
        roomId: args.roomId,
        videoId,
        title,
      });
      if (changed > 0) updated += 1;
    }
    return { requested: candidates.length, updated, unresolved };
  },
});

async function recordCurrent(ctx: MutationCtx, state: Doc<"roomStates">) {
  const { currentVideoId, currentUrl, currentTitle } = state;
  if (!currentVideoId || !currentUrl || !currentTitle) return;
  const playedAtMs = Date.now();
  const existing = await ctx.db
    .query("playHistory")
    .withIndex("by_room_and_video_id", (q) =>
      q.eq("roomId", state.roomId).eq("videoId", currentVideoId),
    )
    .take(100);

  if (existing[0]) {
    await ctx.db.patch(existing[0]._id, {
      url: currentUrl,
      title: currentTitle,
      playedAtMs,
    });
    for (const duplicate of existing.slice(1)) await ctx.db.delete(duplicate._id);
    return;
  }

  await ctx.db.insert("playHistory", {
    roomId: state.roomId,
    videoId: currentVideoId,
    url: currentUrl,
    title: currentTitle,
    playedAtMs,
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

async function getRecentUniqueHistory(ctx: Pick<QueryCtx, "db">, roomId: string) {
  const historyRows = await ctx.db
    .query("playHistory")
    .withIndex("by_room_and_played_at", (q) => q.eq("roomId", roomId))
    .order("desc")
    .take(200);
  const seenVideoIds = new Set<string>();
  return historyRows
    .filter((item) => {
      if (seenVideoIds.has(item.videoId)) return false;
      seenVideoIds.add(item.videoId);
      return true;
    })
    .slice(0, 50);
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
    const history = await getRecentUniqueHistory(ctx, args.roomId);

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
    if (state.currentQueueItemId) {
      await recordCurrent(ctx, state);
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
    const history = await getRecentUniqueHistory(ctx, args.roomId);
    const currentIndex = history.findIndex((item) => item.videoId === state.currentVideoId);
    const fallback = history.length > 0
      ? history[currentIndex >= 0 ? (currentIndex + 1) % history.length : 0]
      : undefined;
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
    const history = await getRecentUniqueHistory(ctx, args.roomId);
    const currentIndex = history.findIndex((item) => item.videoId === state.currentVideoId);
    const target = history.length > 0
      ? history[currentIndex >= 0 ? (currentIndex - 1 + history.length) % history.length : 0]
      : undefined;
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

export const playQueued = mutation({
  args: { roomId: v.string(), itemId: v.id("queueItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    validateRoomId(args.roomId);
    const state = await getState(ctx, args.roomId);
    const item = await ctx.db.get(args.itemId);
    if (!state || !item || item.roomId !== args.roomId || item.status !== "queued") {
      throw new Error("找不到播放清單項目");
    }

    if (state.currentQueueItemId) {
      const currentItem = await ctx.db.get(state.currentQueueItemId);
      if (currentItem?.roomId === args.roomId && currentItem.status === "playing") {
        await ctx.db.patch(currentItem._id, { status: "queued" });
      }
    }
    await playQueueItem(ctx, state, item);
    return null;
  },
});

export const deleteHistory = mutation({
  args: { roomId: v.string(), historyId: v.id("playHistory") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.historyId);
    if (!item || item.roomId !== args.roomId) return null;
    const matches = await ctx.db
      .query("playHistory")
      .withIndex("by_room_and_video_id", (q) =>
        q.eq("roomId", args.roomId).eq("videoId", item.videoId),
      )
      .take(100);
    for (const match of matches) await ctx.db.delete(match._id);
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
