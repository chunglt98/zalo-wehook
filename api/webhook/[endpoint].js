import { createClient } from '@vercel/kv';

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

  // Check environment variables
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  console.log('Environment check:', {
    hasUrl: !!kvUrl,
    hasToken: !!kvToken,
    url: kvUrl ? kvUrl.substring(0, 30) + '...' : 'missing'
  });

  if (!kvUrl || !kvToken) {
    console.error('Missing KV credentials');
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp,
      note: 'Received but database not configured',
      error: 'Missing KV_REST_API_URL or KV_REST_API_TOKEN'
    });
  }

  // Try to save to KV
  try {
    const kv = createClient({
      url: kvUrl,
      token: kvToken,
    });
    
    const key = `webhook:${endpoint}`;
    
    // Lấy logs cũ
    let existingLogs = [];
    try {
      existingLogs = await kv.get(key) || [];
    } catch (e) {
      console.error('Error getting existing logs:', e);
      existingLogs = [];
    }
    
    // Thêm log mới
    existingLogs.unshift(logData);
    
    // Giữ tối đa 100 logs
    if (existingLogs.length > 100) {
      existingLogs.length = 100;
    }
    
    // Lưu lại
    await kv.set(key, existingLogs);
    
    // Cập nhật danh sách endpoints
    const endpointsKey = 'webhook:endpoints';
    let endpoints = [];
    try {
      endpoints = await kv.get(endpointsKey) || [];
    } catch (e) {
      console.error('Error getting endpoints:', e);
      endpoints = [];
    }
    
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
      await kv.set(endpointsKey, endpoints);
    }

    console.log('✅ Saved to KV successfully');
    
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp
    });
    
  } catch (error) {
    console.error('❌ Error saving webhook:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp,
      note: 'Received but failed to save to database',
      error: error.message
    });
  }
}
