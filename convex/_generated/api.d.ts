/* eslint-disable */
/**
 * Generated API utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 */

import type * as player from "../player.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  player: typeof player;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
