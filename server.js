const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8080;

app.use(express.static('.'));

app.use(createProxyMiddleware({
  filter: (pathname) => pathname.startsWith('/api'),
  target: 'https://launchpad-backend-production-63dc.up.railway.app',
  changeOrigin: true,
  onProxyReq: (proxyReq) => {
    proxyReq.setHeader('origin', 'https://aquafamily.fun');
    proxyReq.setHeader('referer', 'https://aquafamily.fun/');
  }
}));

app.listen(PORT, () => {
  console.log('Local dev server running on http://localhost:' + PORT);
});
