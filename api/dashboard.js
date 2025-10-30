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
    // 🧹 Kiểm tra key endpoint
    const endpointsKey = 'webhook:endpoints';
    let endpoints = await kv.smembers(endpointsKey) || [];

    // 🔄 Lấy thống kê từng endpoint
    const stats = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const count = await kv.llen(`webhook:${ep}`) || 0;
          const latestLog = await kv.lindex(`webhook:${ep}`, 0);
          
          let lastUpdate = null;
          if (latestLog) {
            try {
              const log = typeof latestLog === 'string' ? JSON.parse(latestLog) : latestLog;
              lastUpdate = log.timestamp ? toGMT7(log.timestamp) : null;
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
          
          return {
            name: ep,
            events: count,
            lastUpdate,
          };
        } catch (err) {
          console.warn(`⚠️ Error loading endpoint: ${ep}`, err.message);
          return { name: ep, events: 0, lastUpdate: null };
        }
      })
    );

    // Sắp xếp theo thời gian mới nhất
    stats.sort((a, b) => {
      if (!a.lastUpdate) return 1;
      if (!b.lastUpdate) return -1;
      return b.lastUpdate.localeCompare(a.lastUpdate);
    });

    const totalEvents = stats.reduce((sum, s) => sum + s.events, 0);
    const activeEndpoints = stats.filter(s => s.events > 0).length;

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>🔔 Webhook Dashboard - Zalo Events</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
      animation: fadeInDown 0.6s ease-out;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    }

    .header p {
      font-size: 1.1em;
      opacity: 0.9;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
      animation: fadeInUp 0.6s ease-out 0.2s both;
    }

    .stat-card {
      background: white;
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      text-align: center;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .stat-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
    }

    .stat-card .icon {
      font-size: 3em;
      margin-bottom: 10px;
    }

    .stat-card .number {
      font-size: 3em;
      font-weight: bold;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 5px;
    }

    .stat-card .label {
      font-size: 1em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 500;
    }

    .endpoints-section {
      animation: fadeInUp 0.6s ease-out 0.4s both;
    }

    .section-header {
      background: white;
      border-radius: 16px 16px 0 0;
      padding: 20px 30px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .section-header h2 {
      font-size: 1.5em;
      color: #333;
    }

    .refresh-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 0.9em;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      font-weight: 600;
    }

    .refresh-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }

    .refresh-btn:active {
      transform: scale(0.95);
    }

    .endpoints-list {
      background: white;
      border-radius: 0 0 16px 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .endpoint-item {
      padding: 25px 30px;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s ease;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      align-items: center;
    }

    .endpoint-item:last-child {
      border-bottom: none;
    }

    .endpoint-item:hover {
      background: #f8f9ff;
    }

    .endpoint-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .endpoint-name {
      font-size: 1.3em;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .endpoint-name::before {
      content: "📡";
      font-size: 1.2em;
    }

    .endpoint-meta {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      font-size: 0.9em;
      color: #666;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .view-logs-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      display: inline-block;
      white-space: nowrap;
    }

    .view-logs-btn:hover {
      transform: translateX(3px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }

    .empty-state {
      padding: 80px 30px;
      text-align: center;
      color: #999;
    }

    .empty-state .icon {
      font-size: 5em;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5em;
      margin-bottom: 10px;
      color: #666;
    }

    .empty-state p {
      font-size: 1em;
      color: #999;
    }

    .footer {
      text-align: center;
      color: white;
      margin-top: 40px;
      opacity: 0.8;
      font-size: 0.9em;
    }

    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      .header h1 {
        font-size: 2em;
      }

      .stats-grid {
        grid-template-columns: 1fr;
      }

      .endpoint-item {
        grid-template-columns: 1fr;
        gap: 15px;
      }

      .view-logs-btn {
        width: 100%;
        text-align: center;
      }

      .section-header {
        flex-direction: column;
        align-items: stretch;
      }

      .refresh-btn {
        width: 100%;
      }
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-left: 8px;
      animation: pulse 2s infinite;
    }

    .status-active {
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
    }

    .status-idle {
      background: #f59e0b;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Webhook Dashboard</h1>
      <p>Real-time monitoring for Zalo webhook events</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="icon">📡</div>
        <div class="number">${stats.length}</div>
        <div class="label">Total Endpoints</div>
      </div>
      
      <div class="stat-card">
        <div class="icon">✅</div>
        <div class="number">${activeEndpoints}</div>
        <div class="label">Active Endpoints</div>
      </div>
      
      <div class="stat-card">
        <div class="icon">📊</div>
        <div class="number">${totalEvents.toLocaleString()}</div>
        <div class="label">Total Events</div>
      </div>
    </div>

    <div class="endpoints-section">
      <div class="section-header">
        <h2>📋 Endpoints</h2>
        <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
      </div>
      
      <div class="endpoints-list">
        ${stats.length === 0 ? `
          <div class="empty-state">
            <div class="icon">🔭</div>
            <h3>No webhooks yet</h3>
            <p>Waiting for incoming events...</p>
          </div>
        ` : stats.map(s => `
          <div class="endpoint-item">
            <div class="endpoint-info">
              <div class="endpoint-name">
                ${s.name}
                <span class="status-indicator ${s.events > 0 ? 'status-active' : 'status-idle'}"></span>
              </div>
              <div class="endpoint-meta">
                <div class="meta-item">
                  <span>📅</span>
                  <span>${s.lastUpdate || 'No data yet'}</span>
                </div>
                <div class="meta-item">
                  <span class="badge">${s.events} events</span>
                </div>
              </div>
            </div>
            <a class="view-logs-btn" href="/api/logs?endpoint=${s.name}" target="_blank">
              📄 View Logs
            </a>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="footer">
      <p>Last updated: ${toGMT7(new Date().toISOString())} (GMT+7)</p>
      <p>Auto-refresh: Click the refresh button to update data</p>
    </div>
  </div>

  <script>
    // Auto refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Error</title>
        <style>
          body {
            font-family: sans-serif;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .error-box {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
          }
          h1 { color: #e74c3c; margin-bottom: 20px; }
          pre {
            background: #f7f7f7;
            padding: 20px;
            border-radius: 8px;
            overflow: auto;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>⚠️ Dashboard Error</h1>
          <p>Unable to load dashboard:</p>
          <pre>${error.message}\n\n${error.stack}</pre>
        </div>
      </body>
      </html>
    `);
  }
}
