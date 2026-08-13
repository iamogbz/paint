import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

function directoryListingPlugin() {
  const targetPath = '/daily-challenge';
  
  return {
    name: 'directory-listing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        
        // match exact or with trailing slash
        const rawUrl = req.url.split('?')[0];
        if (rawUrl === targetPath || rawUrl === targetPath + '/') {
          const dirPath = path.resolve(__dirname, 'public/daily-challenge');
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            const fileLinks = files.filter(f => f !== 'index.html').map(f => `<li><a href="/daily-challenge/${f}" style="color: blue; text-decoration: underline;">${f}</a></li>`).join('');
            const html = `<!DOCTYPE html><html><head><title>Index of /daily-challenge</title><style>body { font-family: system-ui, sans-serif; padding: 2rem; background: #fff; color: #000; }</style></head><body><h1>Index of /daily-challenge</h1><ul>${fileLinks}</ul></body></html>`;
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
            return;
          }
        }
        next();
      });
    },
    generateBundle() {
      const dirPath = path.resolve(__dirname, 'public/daily-challenge');
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        const fileLinks = files.filter(f => f !== 'index.html').map(f => `<li><a href="/daily-challenge/${f}" style="color: blue; text-decoration: underline;">${f}</a></li>`).join('\n          ');
        const html = `<!DOCTYPE html><html><head><title>Index of /daily-challenge</title><style>body { font-family: system-ui, sans-serif; padding: 2rem; background: #fff; color: #000; }</style></head><body><h1>Index of /daily-challenge</h1><ul>\n          ${fileLinks}\n        </ul></body></html>`;
        
        this.emitFile({
          type: 'asset',
          fileName: 'daily-challenge/index.html',
          source: html
        });
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [directoryListingPlugin()],
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
