import { createClient } from '@vercel/kv';

// ✅ Cấu hình runtime ổn định cho Vercel
export const config = {
  runtime: 'nodejs',
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  const endpoint = req.url.replace(/^\/(api\/)?webhook\//, '').split('?')[0];

  // 👉 1️⃣ Zalo gọi GET để xác thực domain
  if (req.method === 'GET') {
    const { verify_token } = req.query;
    console.log('🔍 Zalo verifying:', verify_token);
    if (verify_token) return res.status(200).send(verify_token);
    return res.status(400).send('Missing verify_token');
  }

  // 👉 2️⃣ Zalo gửi event qua POST
  if (req.method === 'POST') {
    console.log('📥 Webhook received:', endpoint, req.body);

    // Tạo client KV
    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    const logData = {
      timestamp: new Date().toISOString(),
      endpoint,
      body: req.body,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    };

    try {
      // Lưu log
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

      return res.status(200).json({
        status: 'ok',
        endpoint,
        received_at: logData.timestamp,
        note: 'Saved successfully',
      });
    } catch (error) {
      console.error('❌ Error saving webhook:', error);
      return res.status(200).json({
        status: 'ok',
        endpoint,
        received_at: new Date().toISOString(),
        note: 'Failed to save',
        error: String(error.message || error),
      });
    }
  }

  // 👉 3️⃣ Các method khác (PUT, DELETE, v.v.)
  return res.status(405).send('Method not allowed');
}
