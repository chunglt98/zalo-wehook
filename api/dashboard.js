import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  try {
    const endpoints = (await kv.get('webhook:endpoints')) || [];

    // Lấy dữ liệu từng endpoint
    const stats = await Promise.all(
      endpoints.map(async (ep) => {
        const logs = (await kv.get(`webhook:${ep}`)) || [];
        const last = logs[0]?.timestamp ? new Date(logs[0].timestamp) : null;
        return {
          name: ep,
          events: logs.length,
          lastUpdate: last,
        };
      })
    );

    // ✅ Sắp xếp theo thời gian giảm dần (mới nhất lên đầu)
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
        }
        .stat-card {
          background: white; border-radius: 10px; padding: 15px 25px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1); text-align: center;
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
        .endpoint h2 { margin: 0; color: #333; }
        .info { color: #666; font-size: 14px; margin-top: 6px; }
        .actions { margin-top: 12px; }
        a.btn {
          text-decoration: none; color: white; background: #0078ff;
          padding: 6px 14px; border-radius: 6px; margin-right: 8px;
        }
        #last-refresh {
          text-align:center; color:#888; font-size:13px; margin-top:20px;
        }
      </style>
    </head>
    <body>
      <h1>📡 Webhook Dashboard</h1>
      <div class="stats">
        <div class="stat-card"><span>${stats.length}</span>Endpoints</div>
        <div class="stat-card"><span>${totalEvents}</span>Total Events</div>
      </div>

      <div class="endpoint-list">
        ${renderEndpoints(stats)}
      </div>

      <div id="last-refresh">Cập nhật lần cuối: ${formatVNTime(new Date())}</div>
    </body>
    </html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Error loading dashboard:', error);
    return res.status(500).send('Lỗi tải dashboard');
  }
}

function renderEndpoints(stats) {
  if (stats.length === 0)
    return '<p style="text-align:center;color:#888;">Chưa có webhook nào được nhận.</p>';

  return stats
    .map(
      (s) => `
      <div class="endpoint">
        <h2>${s.name}</h2>
        <div class="info">
          📅 Lần cập nhật gần nhất: ${
            s.lastUpdate
              ? formatVNTime(s.lastUpdate)
              : 'Chưa có dữ liệu'
          }<br>
          🧩 Tổng số event: <b>${s.events}</b>
        </div>
        <div class="actions">
          <a class="btn" href="/logs?endpoint=${s.name}" target="_blank">Xem log</a>
        </div>
      </div>`
    )
    .join('');
}

function formatVNTime(date) {
  return new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
