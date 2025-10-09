import { createClient } from '@vercel/kv';

export const config = {
  runtime: 'nodejs', // ép chạy Node.js chứ không phải Edge
  api: {
    bodyParser: true, // đảm bảo parse JSON cho webhook
  },
};


export default async function handler(req, res) {
  // ✅ Nếu là request GET (Zalo đang xác thực domain)
  if (req.method === 'GET') {
    const { verify_token } = req.query;

    // Log cho dễ debug
    console.log('🔍 Zalo verification request:', verify_token);

    // Trả lại đúng token cho Zalo
    if (verify_token) {
      return res.status(200).send(verify_token);
    } else {
      return res.status(400).send('Missing verify_token');
    }
  }

  // ... các xử lý POST webhook khác bên dưới
}


export default async function handler(req, res) {
  // Kiểm tra method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug env
  console.log('ENV DEBUG:', {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN_EXISTS: !!process.env.KV_REST_API_TOKEN
  });

  // Khởi tạo client KV thủ công để tránh lỗi import static
  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN
  });

  // Lấy endpoint name
  const endpoint = req.url.replace(/^\/(api\/)?webhook\//, '').split('?')[0];

  // Dữ liệu log
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint,
    body: req.body,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  };

  console.log('📥 Webhook received:', endpoint, logData);

  try {
    const key = `webhook:${endpoint}`;

    // Lấy logs cũ
    const existingLogs = (await kv.get(key)) || [];
    existingLogs.unshift(logData);
    if (existingLogs.length > 100) existingLogs.length = 100;

    // Ghi lại log
    await kv.set(key, existingLogs);

    // Ghi danh sách endpoints
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
      note: 'Saved successfully'
    });
  } catch (error) {
    console.error('❌ Error saving webhook:', error);
    return res.status(500).json({
      status: 'ok',
      endpoint,
      received_at: logData.timestamp,
      note: 'Failed to save',
      error: String(error.message || error)
    });
  }
}
