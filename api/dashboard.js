import { createClient } from '@vercel/kv';

// Convert UTC → GMT+7
function toGMT7(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  try {
    const endpointsKey = 'webhook:endpoints';
    let endpoints = [];

    // 🔧 Auto-fix WRONGTYPE error
    try {
      endpoints = await kv.smembers(endpointsKey) || [];
    } catch (e) {
      if (e.message.includes('WRONGTYPE')) {
        await kv.del(endpointsKey);
        const allKeys = await kv.keys('webhook:*') || [];
        endpoints = allKeys
          .filter(k => k !== endpointsKey)
          .map(k => k.replace('webhook:', ''));
        if (endpoints.length > 0) {
          await kv.sadd(endpointsKey, ...endpoints);
        }
      }
    }

    // Lấy thống kê
    const stats = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          let count = 0;
          let latestLog = null;
          
          try {
            count = await kv.llen(`webhook:${ep}`) || 0;
            latestLog = await kv.lindex(`webhook:${ep}`, 0);
          } catch (e) {
            if (e.message.includes('WRONGTYPE')) {
              const oldData = await kv.get(`webhook:${ep}`);
              if (Array.isArray(oldData)) {
                count = oldData.length;
                latestLog = oldData[0];
              }
            }
          }
          
          let lastUpdate = null;
          if (latestLog) {
            try {
              const log = typeof latestLog === 'string' ? JSON.parse(latestLog) : latestLog;
              lastUpdate = log.timestamp || null;
            } catch (e) {}
          }
          
          return { name: ep, events: count, lastUpdate };
        } catch (err) {
          return { name: ep, events: 0, lastUpdate: null };
        }
      })
    );

    // ✅ Sắp xếp theo thời gian MỚI NHẤT lên đầu
    stats.sort((a, b) => {
      if (!a.lastUpdate) return 1;
      if (!b.lastUpdate) return -1;
      return new Date(b.lastUpdate) - new Date(a.lastUpdate);
    });

    const totalEvents = stats.reduce((sum, s) => sum + s.events, 0);

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Webhook Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #333;
    }
    .summary {
      background: white;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .summary-item {
      font-size: 14px;
      color: #666;
    }
    .summary-item strong {
      color: #333;
      font-size: 18px;
    }
    .refresh-btn {
      background: #0066cc;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .refresh-btn:hover {
      background: #0052a3;
    }
    table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th {
      background: #f8f9fa;
      padding: 12px 15px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #555;
      border-bottom: 1px solid #e0e0e0;
    }
    td {
      padding: 12px 15px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .endpoint-name {
      font-weight: 500;
      color: #333;
    }
    .time {
      color: #666;
      font-size: 13px;
    }
    .events {
      color: #0066cc;
      font-weight: 500;
    }
    .view-link {
      color: #0066cc;
      text-decoration: none;
      font-size: 13px;
    }
    .view-link:hover {
      text-decoration: underline;
    }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #999;
      background: white;
      border-radius: 8px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #999;
    }
    @media (max-width: 768px) {
      table {
        font-size: 13px;
      }
      th, td {
        padding: 10px 8px;
      }
      .time {
        font-size: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📡 Webhook Dashboard</h1>
    
    <div class="summary">
      <div class="summary-item">
        Endpoints: <strong>${stats.length}</strong>
      </div>
      <div class="summary-item">
        Total Events: <strong>${totalEvents.toLocaleString()}</strong>
      </div>
    </div>

    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>

    ${stats.length === 0 ? `
      <div class="empty">
        <p>📭 No webhooks yet. Waiting for events...</p>
      </div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Last Update</th>
            <th>Events</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${stats.map(s => `
            <tr>
              <td class="endpoint-name">${s.name}</td>
              <td class="time">${s.lastUpdate ? toGMT7(s.lastUpdate) : 'No data'}</td>
              <td class="events">${s.events}</td>
              <td>
                <a class="view-link" href="/api/logs?endpoint=${s.name}" target="_blank">View Logs →</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}

    <div class="footer">
      Last updated: ${toGMT7(new Date().toISOString())} (GMT+7) • Auto-refresh: 30s
    </div>
  </div>

  <script>
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
}
