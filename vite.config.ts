import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function resolveBasePath(): string {
  const explicitBase = process.env.VITE_BASE_PATH?.trim();
  if (explicitBase) {
    const cleaned = explicitBase.replace(/^\/+|\/+$/g, '');
    return cleaned ? `/${cleaned}/` : '/';
  }

  const ghRepo = process.env.GITHUB_REPOSITORY?.split('/')[1]?.trim();
  if (process.env.GITHUB_ACTIONS === 'true' && ghRepo) {
    if (ghRepo.toLowerCase().endsWith('.github.io')) {
      return '/';
    }
    return `/${ghRepo}/`;
  }

  return '/';
}

export default defineConfig(() => {
  return {
    base: resolveBasePath(),
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          if (process.env.GITHUB_ACTIONS === 'true') {
            const indexHtml = path.join(distDir, 'index.html');
            const fallbackHtml = path.join(distDir, '404.html');
            if (fs.existsSync(indexHtml)) {
              fs.copyFileSync(indexHtml, fallbackHtml);
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
