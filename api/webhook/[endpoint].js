console.log("ENV DEBUG:", {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN_EXISTS: !!process.env.KV_REST_API_TOKEN,
  KV_URL_EXISTS: !!process.env.KV_URL,
  NODE_ENV: process.env.NODE_ENV
});



console.log("✅ KV_REST_API_URL:", process.env.KV_REST_API_URL);
console.log("✅ KV_REST_API_TOKEN exists:", !!process.env.KV_REST_API_TOKEN);


process.env.KV_REST_API_URL = process.env.STORAGE_KV_REST_API_URL;
process.env.KV_REST_API_TOKEN = process.env.STORAGE_KV_REST_API_TOKEN;
process.env.KV_REST_API_READ_ONLY_TOKEN = process.env.STORAGE_KV_REST_API_READ_ONLY_TOKEN;
process.env.KV_URL = process.env.STORAGE_KV_URL;


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
    body: req.body
  };

  console.log('📥 Webhook received:', endpoint);

  // Lấy credentials từ env
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  console.log('Env check:', {
    hasUrl: !!kvUrl,
    hasToken: !!kvToken,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS'))
  });

  if (!kvUrl || !kvToken) {
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp,
      note: 'Database not configured',
      debug: {
        envKeys: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS'))
      }
    });
  }

  // Dùng REST API trực tiếp
  try {
    const key = `webhook:${endpoint}`;
    
    // Get existing logs
    let existingLogs = [];
    try {
      const getResponse = await fetch(`${kvUrl}/get/${key}`, {
        headers: { 'Authorization': `Bearer ${kvToken}` }
      });
      const getData = await getResponse.json();
      if (getData.result) {
        existingLogs = JSON.parse(getData.result);
      }
    } catch (e) {
      console.log('No existing logs or error:', e.message);
    }
    
    // Add new log
    existingLogs.unshift(logData);
    if (existingLogs.length > 100) {
      existingLogs.length = 100;
    }
    
    // Save back
    await fetch(`${kvUrl}/set/${key}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(existingLogs)
    });
    
    // Update endpoints list
    const endpointsKey = 'webhook:endpoints';
    let endpoints = [];
    try {
      const getEndpoints = await fetch(`${kvUrl}/get/${endpointsKey}`, {
        headers: { 'Authorization': `Bearer ${kvToken}` }
      });
      const endpointsData = await getEndpoints.json();
      if (endpointsData.result) {
        endpoints = JSON.parse(endpointsData.result);
      }
    } catch (e) {
      console.log('No existing endpoints');
    }
    
    if (!endpoints.includes(endpoint)) {
      endpoints.push(endpoint);
      await fetch(`${kvUrl}/set/${endpointsKey}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(endpoints)
      });
    }

    console.log('✅ Saved successfully');
    
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    
    return res.status(200).json({
      status: 'ok',
      endpoint: endpoint,
      received_at: logData.timestamp,
      note: 'Failed to save',
      error: error.message
    });
  }
}
