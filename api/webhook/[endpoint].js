import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  const { endpoint } = req.query;
  
  const kv = createClient({
    url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
    token: process.env.KV_REST_API_TOKEN,
  });

  try {
    if (endpoint) {
      // Lấy logs của 1 endpoint (dùng LRANGE với list)
      const key = `webhook:${endpoint}`;
      const logs = await kv.lrange(key, 0, 99);
      
      if (logs && logs.length > 0) {
        // Parse JSON strings
        const parsedLogs = logs.map(item => 
          typeof item === 'string' ? JSON.parse(item) : item
        );
        
        const text = parsedLogs.map(log => 
          `${'='.repeat(60)}\n` +
          `[${log.timestamp}] ID: ${log.id}\n` +
          `Endpoint: ${log.endpoint}\n` +
          `Body: ${JSON.stringify(log.body, null, 2)}\n`
        ).join('\n');
        
        return res.status(200).send(text);
      } else {
        return res.status(200).send('No logs found');
      }
      
    } else {
      // Lấy danh sách endpoints (dùng SMEMBERS với set)
      const endpointsKey = 'webhook:endpoints';
      const endpoints = await kv.smembers(endpointsKey) || [];
      
      // Get stats for each endpoint
      const stats = await Promise.all(
        endpoints.map(async (ep) => {
          const key = `webhook:${ep}`;
          const count = await kv.llen(key) || 0;
          
          // Get latest log
          const latest = await kv.lindex(key, 0);
          let lastUpdate = null;
          if (latest) {
            const log = typeof latest === 'string' ? JSON.parse(latest) : latest;
            lastUpdate = log.timestamp;
          }
          
          return {
            name: ep,
            events: count,
            lastUpdate: lastUpdate
          };
        })
      );
      
      return res.status(200).json({ endpoints: stats });
    }
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
