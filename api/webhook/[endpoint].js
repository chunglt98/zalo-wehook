import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Chỉ accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Lấy endpoint name từ URL
  const endpoint = req.url.replace('/api/webhook/', '').split('?')[0];
  
  // Log data
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint: endpoint,
    body: req.body,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  };

  console.log('📥 Webhook received:', endpoint, JSON.stringify(logData, null, 2));

  try {
    // Lưu vào Vercel KV (Redis)
    const key = `webhook:${endpoint}`;
    
    // Lấy logs cũ
    const existingLogs = await kv.get(key) || [];
    
    // Thêm log mới vào đầu
    existingLogs.unshift(logData);
    
    // Giữ tối đa 100 logs gần nhất
    if (existingLogs.length > 100) {
      existingLogs.length = 100;
    }
    
    // Lưu lại
    await kv.set(key, existingLogs);
    
    // Cập nhật danh sách endpoints
    const endpointsKey = 'webhook:endpoints';
    const endpoints = await kv.get(endpointsKey) || [];
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
      await kv.set(endpointsKey, endpoints);
    }

    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp
    });
    
  } catch (error) {
    console.error('Error saving webhook:', error);
    return res.status(500).json({ error: 'Failed to save webhook' });
  }
}
