import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 本機開發載 root .env 以拿到 VITE_PROXY_TARGET（Windows port 3000 不能用時要改埠口）
const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, '../../.env');
try { process.loadEnvFile?.(rootEnv); } catch {}

const target = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Windows host → Linux container 的 bind mount 不會觸發 inotify，
    // 導致 Vite HMR 收不到檔案變更（改了 code 但畫面不更新）。改用輪詢監聽。
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/socket.io': { target, ws: true },
      '/auth':      { target },
      '/admin':     { target },
      '/health':    { target },
    },
  },
});
