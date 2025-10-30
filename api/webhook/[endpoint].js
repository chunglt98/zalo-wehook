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

    // ✅ Lấy endpoint từ URL (BỎ query string!)
    const endpoint = req.url
      .replace(/^\/(api\/)?webhook\//, '')
      .split('?')[0]  // ← BỎ query string
      .replace(/^\//, '') || 'default';

    console.log('📥 Webhook received:', endpoint, req.method);

    // 👉 GET request: Xác thực domain Zalo
    if (req.method === 'GET') {
      const { verify_token } = req.query;
      console.log('🔍 Zalo verifying:', verify_token);
      if (verify_token) return res.status(200).send(verify_token);
      return res.status(400).send('Missing verify_token');
    }

    // 👉 POST request: Lưu webhook data
    if (req.method === 'POST') {
      const logData = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        endpoint,
        method: req.method,
        body: req.body,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
      };

      const key = `webhook:${endpoint}`;

      try {
        // ✅ Dùng LPUSH (LIST command) - atomic, race-condition safe
        await kv.lpush(key, JSON.stringify(logData));
        await kv.ltrim(key, 0, 99); // Giới hạn 100 logs

        // ✅ Cập nhật danh sách endpoints (SADD - atomic)
        await kv.sadd('webhook:endpoints', endpoint);

        console.log('✅ Saved:', endpoint);

        return res.status(200).json({
          status: 'ok',
          endpoint,
          received_at: logData.timestamp,
          event_id: logData.id,
          note: 'Logged successfully',
        });
      } catch (error) {
        // 🔧 Nếu lỗi WRONGTYPE, tự động fix
        if (error.message.includes('WRONGTYPE')) {
          console.warn('⚠️ Converting old key format:', key);
          
          // Đọc data cũ
          let oldData = null;
          try {
            oldData = await kv.get(key);
          } catch (e) {}

          // Xóa key cũ
          await kv.del(key);

          // Tạo lại bằng LIST
          if (oldData && Array.isArray(oldData)) {
            for (const item of oldData) {
              await kv.lpush(key, typeof item === 'string' ? item : JSON.stringify(item));
            }
          }

          // Lưu log hiện tại
          await kv.lpush(key, JSON.stringify(logData));
          await kv.ltrim(key, 0, 99);
          await kv.sadd('webhook:endpoints', endpoint);

          console.log('✅ Converted and saved:', endpoint);

          return res.status(200).json({
            status: 'ok',
            endpoint,
            received_at: logData.timestamp,
            note: 'Converted and logged successfully',
          });
        }

        throw error; // Lỗi khác thì throw lên
      }
    }

    // 👉 Method khác
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed',
    });

  } catch (err) {
    console.error('❌ Webhook handler error:', err);

    // ✅ Vẫn trả 200 OK để Zalo không retry
    return res.status(200).json({
      status: 'ok',
      note: 'Error while logging',
      error: String(err.message || err),
    });
  }
}
