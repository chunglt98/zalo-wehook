import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { endpoint } = req.query;

  try {
    if (endpoint) {
      // Lấy logs của 1 endpoint cụ thể
      const key = `webhook:${endpoint}`;
      const logs = await kv.get(key) || [];
      
      // Trả về dạng text cho dễ đọc
      const text = logs.map(log => 
        `${'='.repeat(60)}\n` +
        `[${log.timestamp}]\n` +
        `Endpoint: ${log.endpoint}\n` +
        `Body: ${JSON.stringify(log.body, null, 2)}\n`
      ).join('\n');
      
      return res.status(200).send(text);
      
    } else {
      // Lấy danh sách tất cả endpoints
      const endpoints = await kv.get('webhook:endpoints') || [];
      
      const stats = await Promise.all(
        endpoints.map(async (ep) => {
          const logs = await kv.get(`webhook:${ep}`) || [];
          return {
            name: ep,
            events: logs.length,
            lastUpdate: logs[0]?.timestamp || null
          };
        })
      );
      
      return res.status(200).json({ endpoints: stats });
    }
    
  } catch (error) {
    console.error('Error fetching logs:', error);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}