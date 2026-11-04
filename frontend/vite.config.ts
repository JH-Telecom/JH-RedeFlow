import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Identificador desta versao: commit na Vercel, horario do build localmente.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_BUILD_ID || `local-${Date.now()}`;

// Publica /version.json junto do build; o app aberto compara com o seu __APP_BUILD__ para pedir atualizacao.
function versionFile(): Plugin {
  return {
    name: 'jh-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId, builtAt: new Date().toISOString() }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_BUILD__: JSON.stringify(buildId) },
});
