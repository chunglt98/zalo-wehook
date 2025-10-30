import { createClient } from '@vercel/kv';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  try {
    // 🚀 Init KV client
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    // 🚀 Lấy endpoint từ URL
    const endpoint =
      req.url
        .replace(/^\/(api\/)?webhook\//, '')
        .replace(/^\//, '') || 'root';

    // 🚀 Ghi log
    const log = {
      timestamp: new Date().toISOString(),
      endpoint,
      method: req.method,
      body: req.body,
      headers: req.headers,
    };

    const key = `webhook:${endpoint}`;
    const existing = (await kv.get(key)) || [];
    existing.unshift(log);
    if (existing.length > 100) existing.length = 100;
    await kv.set(key, existing);

    // 🚀 Ghi danh sách endpoints
    const endpoints = (await kv.get('webhook:endpoints')) || [];
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
      await kv.set('webhook:endpoints', endpoints);
    }

    // ✅ Trả về phản hồi cho Zalo
    return res.status(200).json({
      status: 'ok',
      endpoint,
      received_at: new Date().toISOString(),
      note: 'Logged successfully',
    });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);

    // ✅ Đảm bảo vẫn trả 200 OK để Zalo không báo lỗi
    return res.status(200).json({
      status: 'ok',
      note: 'Error while logging',
      error: String(err.message || err),
    });
  }
}
