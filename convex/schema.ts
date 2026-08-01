import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  roomStates: defineTable({
    roomId: v.string(),
    isPlaying: v.boolean(),
    volume: v.number(),
    positionSeconds: v.number(),
    durationSeconds: v.number(),
    seekVersion: v.number(),
    currentQueueItemId: v.union(v.id("queueItems"), v.null()),
    currentVideoId: v.union(v.string(), v.null()),
    currentUrl: v.union(v.string(), v.null()),
    currentTitle: v.union(v.string(), v.null()),
    playerHeartbeatAtMs: v.number(),
    commandUpdatedAtMs: v.number(),
  }).index("by_room_id", ["roomId"]),

  queueItems: defineTable({
    roomId: v.string(),
    videoId: v.string(),
    url: v.string(),
    title: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("playing"),
      v.literal("played"),
      v.literal("removed"),
    ),
    position: v.number(),
    addedAtMs: v.number(),
    playedAtMs: v.optional(v.number()),
  })
    .index("by_room_and_status_and_position", ["roomId", "status", "position"])
    .index("by_room_and_status_and_played_at", ["roomId", "status", "playedAtMs"]),

  playHistory: defineTable({
    roomId: v.string(),
    videoId: v.string(),
    url: v.string(),
    title: v.string(),
    playedAtMs: v.number(),
  }).index("by_room_and_played_at", ["roomId", "playedAtMs"]),
});
