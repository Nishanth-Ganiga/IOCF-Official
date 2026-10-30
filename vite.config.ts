import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** Serves the Command Center API during `npm run dev`, using the local store in ~/.iocf-command-center/. */
function commandCenterDev(): Plugin {
  return {
    name: 'iocf-command-center-dev',
    apply: 'serve',
    async configureServer(server) {
      // @ts-expect-error plain JavaScript module outside src/
      const { commandCenterRequestListener } = await import('./server/command/http.mjs');
      // @ts-expect-error plain JavaScript module outside src/
      const { storeFromEnv, FileStore } = await import('./server/command/store.mjs');
      const home = process.env.IOCF_CC_HOME || `${process.env.HOME}/.iocf-command-center`;
      // the same local store the credential tool fills (`npm run cc -- setup`), unless Supabase is configured
      const store = process.env.SUPABASE_URL ? storeFromEnv(process.env) : new FileStore(`${home}/local-store.json`);
      const listener = commandCenterRequestListener({ store });
      server.middlewares.use('/api/command', (req, res) => void listener(req, res));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), commandCenterDev()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: { motion: ['framer-motion'], react: ['react', 'react-dom'] },
      },
    },
  },
});
