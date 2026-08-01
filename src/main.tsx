import { ConvexProvider, ConvexReactClient } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convexUrl ? (
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        <App />
      </ConvexProvider>
    ) : (
      <main className="grid min-h-dvh place-items-center bg-zinc-950 p-6 text-zinc-100">
        <section className="max-w-lg rounded-3xl border border-amber-400/50 bg-zinc-900 p-8 shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">尚未連接 Convex</p>
          <h1 className="mt-3 text-3xl font-black">需要 VITE_CONVEX_URL</h1>
          <p className="mt-3 leading-7 text-zinc-300">
            執行 <code className="rounded bg-black px-2 py-1 text-amber-200">npx convex dev</code> 後重新啟動前端。
          </p>
        </section>
      </main>
    )}
  </React.StrictMode>,
);
