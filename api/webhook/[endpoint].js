import { createClient } from '@vercel/kv';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  const endpoint = req.url.replace(/^\/(api\/)?webhook\//, '').split('?')[0] || 'root';
  const method = req.method;

  // ✅ Chuẩn bị log dữ liệu
  const logData = {
    timestamp: new Date().toISOString(),
    method,
    endpoint,
    body: req.body,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    },
  };

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    // ✅ Lưu log chính (đảm bảo xuất hiện trên dashboard)
    const key = `webhook:${endpoint}`;
    const existing = (await kv.get(key)) || [];
    existing.unshift(logData);
    if (existing.length > 100) existing.length = 100;
    await kv.set(key, existing);

    // ✅ Cập nhật danh sách endpoint
    const endpointsKey = 'webhook:endpoints';
    const endpoints = (await kv.get(endpointsKey)) || [];
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
      await kv.set(endpointsKey, endpoints);
    }

    // 🚀 Trả phản hồi 200 OK cho Zalo
    return res.status(200).json({
      status: 'ok',
      endpoint,
      received_at: new Date().toISOString(),
      note: 'Logged successfully',
    });
  } catch (err) {
    console.error('❌ Webhook save failed:', err.message);

    // ✅ Nếu lỗi KV (ví dụ Upstash timeout), vẫn trả 200 OK cho
