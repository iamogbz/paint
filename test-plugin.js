import fs from 'fs';
import path from 'path';

export function directoryListingPlugin() {
  const targetPath = '/daily-challenge';
  
  return {
    name: 'directory-listing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // match exact or with trailing slash
        if (req.url.split('?')[0].replace(/\/$/, '') === targetPath) {
          const dirPath = path.resolve(__dirname, 'public/daily-challenge');
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            const fileLinks = files.filter(f => f !== 'index.html').map(f => `<li><a href="/daily-challenge/${f}">${f}</a></li>`).join('');
            const html = `<!DOCTYPE html><html><head><title>Index of /daily-challenge</title><style>body { font-family: system-ui, sans-serif; padding: 2rem; }</style></head><body><h1>Index of /daily-challenge</h1><ul>${fileLinks}</ul></body></html>`;
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
        const fileLinks = files.filter(f => f !== 'index.html').map(f => `<li><a href="/daily-challenge/${f}">${f}</a></li>`).join('\n          ');
        const html = `<!DOCTYPE html><html><head><title>Index of /daily-challenge</title><style>body { font-family: system-ui, sans-serif; padding: 2rem; }</style></head><body><h1>Index of /daily-challenge</h1><ul>\n          ${fileLinks}\n        </ul></body></html>`;
        
        this.emitFile({
          type: 'asset',
          fileName: 'daily-challenge/index.html',
          source: html
        });
      }
    }
  };
}
