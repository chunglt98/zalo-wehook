import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { endpoint } = req.query;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!endpoint) {
    return res
      .status(400)
      .send('<h3 style="font-family:sans-serif;color:#666;">Thiếu tham số ?endpoint=</h3>');
  }

  try {
    const logs = (await kv.get(`webhook:${endpoint}`)) || [];

    // format logs HTML
    const logHtml = logs
      .map((log, index) => {
        const eventName = log.body?.event_name
          ? `<b style="color:#0078ff;">${log.body.event_name}</b>`
          : '<i>Không có event_name</i>';

        return `
        <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;background:#fff;">
          <div style="font-weight:bold;color:#444;">#${logs.length - index}</div>
          <div style="color:#666;font-size:13px;">⏰ ${new Date(
            log.timestamp
          ).toLocaleString('vi-VN')}</div>
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
      <title>Webhook Logs - ${endpoint}</title>
      <style>
        body { font-family: "Segoe UI", sans-serif; background:#f4f6fb; margin:0; padding:20px; }
        h1 { color:#333; text-align:center; margin-bottom:30px; }
      </style>
    </head>
    <body>
      <h1>📜 Logs cho endpoint: ${endpoint}</h1>
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
    return res.status(500).send('<p>Lỗi tải logs</p>');
  }
}
