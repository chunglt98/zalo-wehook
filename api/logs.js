import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  const { endpoint } = req.query;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!endpoint) {
    return res
      .status(400)
      .send('<h3 style="font-family:sans-serif;color:#666;">Thiếu tham số ?endpoint=</h3>');
  }

  try {
    // Tạo client KV
    const kv = createClient({
      url: process.env.KV_REST_API_URL?.trim().replace(/\/$/, ''),
      token: process.env.KV_REST_API_TOKEN,
    });

    // 🔥 Đọc từ Redis List (LRANGE) thay vì GET
    const key = `webhook:${endpoint}`;
    const logsRaw = await kv.lrange(key, 0, 99) || [];
    
    // Parse JSON strings thành objects
    const logs = logsRaw.map(item => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item;
      } catch (e) {
        console.error('Error parsing log:', e);
        return { timestamp: new Date().toISOString(), body: {}, error: 'Parse error' };
      }
    });

    // format logs HTML
    const logHtml = logs
      .map((log, index) => {
        const eventName = log.body?.event_name
          ? `<b style="color:#0078ff;">${log.body.event_name}</b>`
          : '<i>Không có event_name</i>';

        return `
        <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;background:#fff;">
          <div style="font-weight:bold;color:#444;">#${index + 1}${log.id ? ` - ID: ${log.id}` : ''}</div>
          <div style="color:#666;font-size:13px;">
            ⏰ ${formatVNTime(log.timestamp)}
          </div>
          <div style="margin-top:8px;">🎯 Event: ${eventName}</div>
          <div style="margin-top:6px;">📦 Payload:</div>
          <pre style="background:#f7f7f7;border-radius:6px;padding:8px;overflow:auto;font-size:13px;">${JSON.stringify(
            log.body,
            null,
            2
          )}</pre>
        </div>`;
      })
      .join('');

    const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Webhook Logs - ${endpoint}</title>
      <style>
        body {
          font-family: "Segoe UI", sans-serif;
          background:#f4f6fb;
          margin:0; padding:20px;
        }
        h1 { color:#333; text-align:center; margin-bottom:30px; }
        .stats {
          text-align: center;
          color: #666;
          margin-bottom: 20px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <h1>📜 Logs cho endpoint: ${endpoint}</h1>
      <div class="stats">
        Tổng số events: <b>${logs.length}</b>
      </div>
      ${
        logs.length === 0
          ? '<p style="text-align:center;color:#888;">Chưa có log nào.</p>'
          : logHtml
      }
    </body>
    </html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return res.status(500).send(`<p>Lỗi tải logs: ${error.message}</p>`);
  }
}

// ✅ Hàm format giờ Việt Nam (GMT+7)
function formatVNTime(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  }
}
