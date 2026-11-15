import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, fs: { allow: [".."] } },
  // Local check of the server build: `vite preview --mode server` with deploy/rpc-proxy.mjs running.
  preview: { proxy: { "/rpc": "http://127.0.0.1:8546" } },
});
