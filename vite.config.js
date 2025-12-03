import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/coingecko': {
          target: 'https://api.coingecko.com/api/v3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/coingecko/, ''),
          secure: false,
        },
        '/api/twitter': {
          target: 'https://api.twitterapi.io',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/twitter/, ''),
          secure: false,
        },
        '/api/binance': {
          target: 'https://api.binance.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/binance/, ''),
          secure: false,
        },
        '/api/gt': {
          target: 'https://api.geckoterminal.com/api/v2',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gt/, ''),
          secure: false,
        }
      },
      configureServer(server) {
        server.middlewares.use('/api/debank-proxy', async (req, res, next) => {
          try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const path = url.searchParams.get('path');

            if (!path) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing path parameter' }));
              return;
            }

            // Construct the DeBank URL
            // Remove 'path' from params and keep the rest
            const params = new URLSearchParams(url.search);
            params.delete('path');
            const queryString = params.toString();

            const targetUrl = `https://pro-openapi.debank.com/v1${path}${queryString ? '?' + queryString : ''}`;

            console.log(`[Vite Proxy] Proxying DeBank request to: ${targetUrl}`);

            const response = await fetch(targetUrl, {
              headers: {
                'AccessKey': env.DEBANK_API_KEY,
                'Accept': 'application/json',
              },
            });

            const data = await response.json();

            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (error) {
            console.error('[Vite Proxy] Error:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
          }
        });
      }
    }
  }
})
