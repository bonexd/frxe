import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packageVersion = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

function syncDisplayedVersion() {
  return {
    name: 'sync-vitr-web-version',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') && !id.endsWith('\\src\\App.jsx')) return null;
      return code.replace(/const VERSION = ['"][^'"]+['"];/, `const VERSION = '${packageVersion}';`);
    },
  };
}

export default defineConfig({
  plugins: [syncDisplayedVersion(), react()],
  build: { target: 'es2022' },
});
