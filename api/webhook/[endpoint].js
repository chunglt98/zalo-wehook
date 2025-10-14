import { createClient } from '@vercel/kv';

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

    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    const logData = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      endpoint,
      body: req.body,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    };

    try {
      const key = `webhook:${endpoint}`;
      
      // 🔧 Auto-migrate: Kiểm tra xem key có phải là old format không
      let needsMigration = false;
      try {
        const type = await kv.type(key);
        if (type && type !== 'list' && type !== 'none') {
          console.log(`⚠️ Migrating ${key} from ${type} to list`);
          needsMigration = true;
        }
      } catch (e) {
        console.log('Type check error (probably new key):', e.message);
      }
      
      if (needsMigration) {
        // Delete old key và tạo mới
        await kv.del(key);
        console.log(`✅ Deleted old key: ${key}`);
      }
      
      // Lưu vào List
      await kv.lpush(key, JSON.stringify(logData));
      await kv.ltrim(key, 0, 99);

      // Cập nhật endpoints (dùng Set)
      const endpointsKey = 'webhook:endpoints';
      
      // Check endpoints key type
      try {
        const endpointsType = await kv.type(endpointsKey);
        if (endpointsType && endpointsType !== 'set' && endpointsType !== 'none') {
          console.log(`⚠️ Migrating ${endpointsKey} from ${endpointsType} to set`);
          await kv.del(endpointsKey);
        }
      } catch (e) {
        console.log('Endpoints type check error:', e.message);
      }
      
      await kv.sadd(endpointsKey, endpoint);

      console.log('✅ Saved successfully');

      return res.status(200).json({
        status: 'ok',
        endpoint,
        received_at: logData.timestamp,
        event_id: logData.id,
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

  return res.status(405).send('Method not allowed');
}
