import { createClient } from '@vercel/kv';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: true },
};

// ⚡ Webhook tối ưu hiệu suất cho Zalo
export default async function handler(req, res) {
  const start = Date.now();
  const endpoint = req.url.replace(/^\/(api\/)?webhook\//, '').split('?')[0] || 'root';
  const method = req.method;

  // ✅ Trả 200 OK NGAY cho Zalo (không chờ xử lý)
  res.status(200).json({ status: 'ok', endpoint, received_at: new Date().toISOString() });

  // ⚙️ Xử lý ngầm (ghi log, lưu dữ liệu)
  process.nextTick(async () => {
    try {
      const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });

      const logData = {
        timestamp: new Date().toISOString(),
        method,
        endpoint,
        body: req.body,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
        duration_ms: Date.now() - start,
      };

      const key = `webhook:${endpoint}`;
      const existing = (await kv.get(key)) || [];
      existing.unshift(logData);
      if (existing.length > 100) existing.length = 100;
      await kv.set(key, existing);

      // Cập nhật danh sách endpoints
      const endpointsKey = 'webhook:endpoints';
      const endpoints = (await kv.get(endpointsKey)) || [];
      if (!endpoints.includes(endpoint)) {
        endpoints.push(endpoint);
        await kv.set(endpointsKey, endpoints);
      }

      console.log('✅ Logged webhook', endpoint);
    } catch (err) {
      console.error('❌ Background log failed:', err.message);
    }
  });
}
