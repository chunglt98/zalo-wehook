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
    return res.status(400).send('<h1>Error: Missing endpoint parameter</h1>');
  }

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    const key = `webhook:${endpoint}`;
    let logs = [];

    // 🔧 Auto-fix WRONGTYPE error
    try {
      const logsRaw = await kv.lrange(key, 0, 99) || [];
      logs = logsRaw.map(item => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item;
        } catch (e) {
          return { timestamp: new Date().toISOString(), body: {}, error: 'Parse error' };
        }
      });
    } catch (e) {
      if (e.message.includes('WRONGTYPE')) {
        const oldData = await kv.get(key);
        if (oldData) {
          await kv.del(key);
          if (Array.isArray(oldData)) {
            logs = oldData;
            for (const item of oldData) {
              await kv.lpush(key, typeof item === 'string' ? item : JSON.stringify(item));
            }
            await kv.ltrim(key, 0, 99);
          }
        }
      }
    }

    // ✅ Logs đã được lưu theo thứ tự mới nhất lên trước (LPUSH)
    // Không cần sort lại

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Logs - ${endpoint}</title>
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
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 24px;
      color: #333;
      margin-bottom: 10px;
    }
    .endpoint-name {
      color: #0066cc;
      font-size: 18px;
      font-weight: 500;
    }
    .stats {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
    .back-btn {
      display: inline-block;
      margin-top: 15px;
      color: #0066cc;
      text-decoration: none;
      font-size: 14px;
    }
    .back-btn:hover {
      text-decoration: underline;
    }
    .log-item {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f0f0f0;
      flex-wrap: wrap;
      gap: 10px;
    }
    .log-number {
      font-weight: 600;
      color: #0066cc;
      font-size: 16px;
    }
    .log-time {
      color: #666;
      font-size: 13px;
    }
    .log-id {
      color: #999;
      font-size: 12px;
      font-family: monospace;
    }
    .event-name {
      font-weight: 500;
      color: #333;
      margin-bottom: 10px;
      font-size: 15px;
    }
    .event-name span {
      color: #0066cc;
    }
    .payload-label {
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .payload {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow: auto;
      border-left: 3px solid #0066cc;
      color: #333;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #999;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    @media (max-width: 768px) {
      .log-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📜 Webhook Logs</h1>
      <div class="endpoint-name">${endpoint}</div>
      <div class="stats">
        Total events: <strong>${logs.length}</strong> • Showing latest ${Math.min(logs.length, 100)}
      </div>
      <a class="back-btn" href="/api/dashboard">← Back to Dashboard</a>
    </div>

    ${logs.length === 0 ? `
      <div class="empty">
        <p>📭 No logs yet</p>
      </div>
    ` : logs.map((log, index) => `
      <div class="log-item">
        <div class="log-header">
          <span class="log-number">#${index + 1}</span>
          <span class="log-time">⏰ ${formatVNTime(log.timestamp)}</span>
          ${log.id ? `<span class="log-id">ID: ${log.id}</span>` : ''}
        </div>
        <div class="event-name">
          Event: <span>${log.body?.event_name || 'No event name'}</span>
        </div>
        <div class="payload-label">📦 Payload:</div>
        <div class="payload">${JSON.stringify(log.body, null, 2)}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
}
