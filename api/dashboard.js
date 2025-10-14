import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  try {
    // Tạo client KV
    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    // Đọc endpoints từ Redis Set
    const endpoints = await kv.smembers('webhook:endpoints') || [];

    // Lấy dữ liệu từng endpoint
    const stats = await Promise.all(
      endpoints.map(async (ep) => {
        const key = `webhook:${ep}`;
        const count = await kv.llen(key) || 0;
        const latestLog = await kv.lindex(key, 0);
        
        let lastUpdate = null;
        if (latestLog) {
          try {
            const log = typeof latestLog === 'string' ? JSON.parse(latestLog) : latestLog;
            lastUpdate = log.timestamp ? new Date(log.timestamp) : null;
          } catch (e) {
            console.error('Error parsing log:', e);
          }
        }
        
        return {
          name: ep,
          events: count,
          lastUpdate: lastUpdate,
        };
      })
    );

    // Sắp xếp theo thời gian giảm dần
    stats.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));

    const totalEvents = stats.reduce((sum, s) => sum + s.events, 0);

    const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8" />
      <title>Zalo Webhook Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body {
          font-family: "Segoe UI", sans-serif;
          background: #f4f6fb;
          margin: 0; padding: 20px;
        }
        h1 { text-align: center; color: #333; margin-bottom: 30px; }
        .stats {
          display: flex; justify-content: center; gap: 30px; margin-bottom: 30px;
          flex-wrap: wrap;
        }
        .stat-card {
          background: white; border-radius: 10px; padding: 15px 25px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1); text-align: center;
          min-width: 150px;
        }
        .stat-card span {
          display: block; font-size: 28px; font-weight: bold; color: #0078ff;
        }
        .endpoint-list { display: grid; gap: 15px; max-width: 800px; margin: 0 auto; }
        .endpoint {
          background: white; padding: 20px; border-radius: 10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
          transition: transform 0.2s ease;
        }
        .endpoint:hover { transform: scale(1.02); }
        .endpoint h2 { margin: 0; color: #333; font-size: 1.3em; }
        .info { color: #666; font-size: 14px; margin-top: 6px; line-height: 1.6; }
        .actions { margin-top: 12px; }
        a.btn {
          text-decoration: none; color: white; background: #0078ff;
          padding: 8px 16px; border-radius: 6px; margin-right: 8px;
          display: inline-block;
          transition: background 0.2s;
        }
        a.btn:hover { background: #0056cc; }
        #last-refresh {
          text-align:center; color:#888; font-size:13px; margin-top:20px;
        }
        .no-data {
          text-align: center;
          color: #888;
          padding: 40px;
          font-size: 1.1em;
        }
      </style>
    </head>
    <body>
      <h1>📡 Zalo Webhook Dashboard</h1>
      <div class="stats">
        <div class="stat-card"><span>${stats.length}</span>Endpoints</div>
        <div class="stat-card"><span>${totalEvents}</span>Total Events</div>
      </div>

      <div class="endpoint-list">
        ${renderEndpoints(stats)}
      </div>

      <div id="last-refresh">
        Cập nhật lần cuối: ${formatVNTime(new Date())}
      </div>
    </body>
    </html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Error loading dashboard:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Error</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #f4f6fb; }
          .error-box {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { color: #e74c3c; }
          pre {
            background: #f7f7f7;
            padding: 15px;
            border-radius: 6px;
            overflow: auto;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>❌ Lỗi tải dashboard</h1>
          <p>Có lỗi xảy ra khi tải dashboard:</p>
          <pre>${error.message}\n\n${error.stack}</pre>
        </div>
      </body>
      </html>
    `);
  }
}

function renderEndpoints(stats) {
  if (stats.length === 0)
    return '<div class="no-data">📭 Chưa có webhook nào được nhận. Đang chờ events...</div>';

  return stats
    .map(
      (s) => `
      <div class="endpoint">
        <h2>📡 ${s.name}</h2>
        <div class="info">
          📅 Lần cập nhật gần nhất: ${
            s.lastUpdate
              ? formatVNTime(s.lastUpdate)
              : '<i>Chưa có dữ liệu</i>'
          }<br>
          🧩 Tổng số event: <b style="color:#0078ff;">${s.events}</b>
        </div>
        <div class="actions">
          <a class="btn" href="/logs?endpoint=${s.name}" target="_blank">📄 Xem log</a>
        </div>
      </div>`
    )
    .join('');
}

function formatVNTime(date) {
  try {
    return new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return 'N/A';
  }
}
