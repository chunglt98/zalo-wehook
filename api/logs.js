import { createClient } from '@vercel/kv';

// Convert UTC → GMT+7
function formatVNTime(date) {
  if (!date) return 'N/A';
  try {
    const d = new Date(date);
    return new Date(d.getTime() + 7 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
  } catch {
    return 'Invalid date';
  }
}

export default async function handler(req, res) {
  const { endpoint } = req.query;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!endpoint) {
    return res.status(400).send(`
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
            text-align: center;
          }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>⚠️ Missing Parameter</h1>
          <p>Please provide <code>?endpoint=your-endpoint</code></p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    const key = `webhook:${endpoint}`;
    let logs = [];

    // 🔧 TRY: Đọc bằng lrange (cho LIST - code mới)
    try {
      const logsRaw = await kv.lrange(key, 0, 99) || [];
      
      // Parse JSON strings thành objects
      logs = logsRaw.map(item => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch (e) {
          console.error('Parse error:', e);
          return { timestamp: new Date().toISOString(), body: {}, error: 'Parse error' };
        }
      });
    } catch (e) {
      // Nếu lỗi WRONGTYPE → Key là kiểu cũ, cần convert
      if (e.message.includes('WRONGTYPE')) {
        console.warn('⚠️ Converting old key format:', key);
        
        // Đọc data cũ bằng GET
        const oldData = await kv.get(key);
        
        if (oldData) {
          // Xóa key cũ
          await kv.del(key);
          
          // Convert sang LIST mới
          if (Array.isArray(oldData)) {
            logs = oldData;
            
            // Lưu lại bằng LIST
            for (const item of oldData) {
              await kv.lpush(key, typeof item === 'string' ? item : JSON.stringify(item));
            }
            await kv.ltrim(key, 0, 99); // Giới hạn 100 logs
            
            console.log('✅ Converted to LIST format');
          }
        }
      } else {
        throw e; // Lỗi khác thì throw lên
      }
    }

    // Format logs HTML
    const logHtml = logs
      .map((log, index) => {
        const eventName = log.body?.event_name
          ? `<span class="event-name">${log.body.event_name}</span>`
          : '<span class="no-event">No event_name</span>';

        return `
        <div class="log-item">
          <div class="log-header">
            <span class="log-number">#${index + 1}</span>
            ${log.id ? `<span class="log-id">ID: ${log.id}</span>` : ''}
            <span class="log-time">⏰ ${formatVNTime(log.timestamp)}</span>
          </div>
          <div class="log-event">
            🎯 Event: ${eventName}
          </div>
          <div class="log-payload-label">📦 Payload:</div>
          <pre class="log-payload">${JSON.stringify(log.body, null, 2)}</pre>
        </div>`;
      })
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>📜 Webhook Logs - ${endpoint}</title>
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
      background: white;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      animation: fadeInDown 0.6s ease-out;
    }

    .header h1 {
      font-size: 2em;
      color: #333;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .endpoint-badge {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.7em;
      font-weight: 600;
    }

    .stats {
      display: flex;
      gap: 20px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #f8f9ff;
      border-radius: 8px;
      font-size: 0.95em;
    }

    .stat-number {
      font-weight: bold;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      margin-top: 20px;
    }

    .back-btn:hover {
      transform: translateX(-3px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }

    .logs-container {
      animation: fadeInUp 0.6s ease-out 0.2s both;
    }

    .log-item {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .log-item:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    }

    .log-header {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .log-number {
      font-weight: bold;
      font-size: 1.2em;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .log-id {
      font-size: 0.85em;
      color: #999;
      font-family: monospace;
    }

    .log-time {
      font-size: 0.9em;
      color: #666;
      margin-left: auto;
    }

    .log-event {
      margin: 15px 0;
      font-size: 1.1em;
      font-weight: 500;
    }

    .event-name {
      color: #667eea;
      font-weight: bold;
    }

    .no-event {
      color: #999;
      font-style: italic;
    }

    .log-payload-label {
      margin: 15px 0 8px 0;
      font-weight: 600;
      color: #666;
    }

    .log-payload {
      background: #f7f7f7;
      border-radius: 8px;
      padding: 15px;
      overflow: auto;
      font-size: 0.9em;
      font-family: 'Courier New', monospace;
      line-height: 1.6;
      border-left: 4px solid #667eea;
    }

    .empty-state {
      background: white;
      border-radius: 16px;
      padding: 80px 30px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    .empty-state .icon {
      font-size: 5em;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5em;
      color: #666;
      margin-bottom: 10px;
    }

    .empty-state p {
      color: #999;
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
        font-size: 1.5em;
        flex-direction: column;
        align-items: flex-start;
      }

      .stats {
        flex-direction: column;
      }

      .stat-item {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        📜 Webhook Logs
        <span class="endpoint-badge">${endpoint}</span>
      </h1>
      
      <div class="stats">
        <div class="stat-item">
          <span>📊 Total events:</span>
          <span class="stat-number">${logs.length}</span>
        </div>
        <div class="stat-item">
          <span>📅 Showing:</span>
          <span class="stat-number">Latest ${Math.min(logs.length, 100)}</span>
        </div>
      </div>

      <a class="back-btn" href="/api/dashboard">
        ← Back to Dashboard
      </a>
    </div>

    <div class="logs-container">
      ${
        logs.length === 0
          ? `
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>No logs yet</h3>
          <p>This endpoint hasn't received any events</p>
        </div>
      `
          : logHtml
      }
    </div>
  </div>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Error fetching logs:', error);
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
          .back-btn {
            display: inline-block;
            margin-top: 20px;
            background: #667eea;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>⚠️ Error Loading Logs</h1>
          <p>Unable to load logs for endpoint: <strong>${endpoint}</strong></p>
          <pre>${error.message}\n\n${error.stack}</pre>
          <a class="back-btn" href="/api/dashboard">← Back to Dashboard</a>
        </div>
      </body>
      </html>
    `);
  }
}
