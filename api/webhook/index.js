import { createClient } from '@vercel/kv';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  console.log('📩 Webhook called:', req.method, req.url);

  // 1️⃣ Xác thực GET (Zalo Developers)
  if (req.method === 'GET') {
    const { verify_token } = req.query;
    if (verify_token) {
      console.log('✅ Zalo verifying domain with token:', verify_token);
      return res.status(200).send(verify_token);
    }
    return res.status(400).send('Missing verify_token');
  }

  // 2️⃣ Nhận event POST từ Zalo
  if (req.method === 'POST') {
    try {
      const kv = createClient({
        url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
        token: process.env.KV_REST_API_TOKEN,
      });

      const logData = {
        timestamp: new Date().toISOString(),
        body: req.body,
        headers: req.headers,
      };

      const key = 'webhook:zalo';
      const existing = (await kv.get(key)) || [];
      existing.unshift(logData);
      if (existing.length > 100) existing.length = 100;
      await kv.set(key, existing);

      return res.status(200).json({
        status: 'ok',
        received_at: logData.timestamp,
        note: 'Saved successfully',
      });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(200).json({
        status: 'ok',
        note: 'Failed to save',
        error: String(error.message || error),
      });
    }
  }

  // 3️⃣ Method khác
  return res.status(405).send('Method not allowed');
}
