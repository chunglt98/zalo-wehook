import { createClient } from '@vercel/kv';

// Convert UTC → GMT+7
function toGMT7(isoString) {
  const date = new Date(isoString);
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export default async function handler(req, res) {
  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  try {
    // 🧹 Kiểm tra key endpoint
    const endpointsKey = 'webhook:endpoints';
    let endpoints = await kv.get(endpointsKey);
    if (endpoints && typeof endpoints !== 'object') {
      console.warn('⚠️ Resetting malformed key:', endpointsKey);
      await kv.del(endpointsKey);
      endpoints = [];
    }

    endpoints = endpoints || [];

    // 🔄 Lấy thống kê từng endpoint
    const stats = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const logs = (await kv.get(`webhook:${ep}`)) || [];
          return {
            name: ep,
            events: logs.length,
            lastUpdate: logs[0]?.timestamp ? toGMT7(logs[0].timestamp) : null,
          };
        } catch (err) {
          console.warn(`⚠️ Resetting malformed key: webhook:${ep}`, err.message);
          await kv.del(`webhook:${ep}`);
          return { name: ep, events: 0, lastUpdate: null };
        }
      })
    );

    return res.status(200).json({
      status: 'ok',
      endpoints: stats,
      total: stats.length,
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to load dashboard',
      error: String(error.message || error),
    });
  }
}
