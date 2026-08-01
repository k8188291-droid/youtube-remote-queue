import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function githubPagesBase() {
  if (!process.env.GITHUB_ACTIONS) return "/";
  const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!repository || repository === `${owner}.github.io`) return "/";
  return `/${repository}/`;
}

export default defineConfig({
  base: githubPagesBase(),
  plugins: [react(), tailwindcss()],
});
