import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const { API_PROXY_TARGET } = loadEnv(mode, ".", "");
  return {
    server: {
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: API_PROXY_TARGET || "http://127.0.0.1:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
