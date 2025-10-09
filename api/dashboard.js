export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zalo Webhook Monitor</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        h1 {
          color: white;
          text-align: center;
          margin-bottom: 30px;
          font-size: 2.5em;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-number {
          font-size: 2.5em;
          font-weight: bold;
          color: #667eea;
        }
        .stat-label {
          color: #666;
          margin-top: 5px;
        }
        .endpoints {
          display: grid;
          gap: 15px;
        }
        .endpoint {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          transition: transform 0.2s;
        }
        .endpoint:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        }
        .endpoint-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .endpoint-name {
          font-size: 1.3em;
          font-weight: bold;
          color: #333;
        }
        .endpoint-badge {
          background: #4CAF50;
          color: white;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 0.9em;
        }
        .endpoint-info {
          color: #666;
          font-size: 0.9em;
          line-height: 1.6;
        }
        .endpoint-actions {
          margin-top: 15px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          padding: 8px 16px;
          border-radius: 5px;
          text-decoration: none;
          font-size: 0.9em;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }
        .btn-primary {
          background: #667eea;
          color: white;
        }
        .btn-primary:hover {
          background: #5568d3;
        }
        .btn-secondary {
          background: #f0f0f0;
          color: #333;
        }
        .btn-secondary:hover {
          background: #e0e0e0;
        }
        .refresh-info {
          text-align: center;
          color: white;
          margin-top: 20px;
          font-size: 0.9em;
        }
        .no-data {
          text-align: center;
          color: white;
          padding: 40px;
          font-size: 1.2em;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .updating {
          animation: pulse 1s infinite;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Zalo Webhook Monitor</h1>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-number" id="totalEndpoints">0</div>
            <div class="stat-label">Active Endpoints</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="totalEvents">0</div>
            <div class="stat-label">Total Events</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="lastUpdate">-</div>
            <div class="stat-label">Last Update</div>
          </div>
        </div>
        
        <div id="endpoints" class="endpoints"></div>
        
        <div class="refresh-info">
          <span id="refreshStatus">Auto-refresh every 3 seconds</span>
        </div>
      </div>
      
      <script>
        async function loadData() {
          const statusEl = document.getElementById('refreshStatus');
          statusEl.classList.add('updating');
          
          try {
            const response = await fetch('/logs');
            const data = await response.json();
            
            document.getElementById('totalEndpoints').textContent = data.endpoints.length;
            
            let totalEvents = 0;
            let html = '';
            
            if (data.endpoints.length === 0) {
              html = '<div class="no-data">📭 No webhooks received yet. Waiting for events...</div>';
            } else {
              data.endpoints.sort((a, b) => b.events - a.events);
              
              for (const endpoint of data.endpoints) {
                totalEvents += endpoint.events;
                const lastUpdate = endpoint.lastUpdate 
                  ? new Date(endpoint.lastUpdate).toLocaleString('vi-VN')
                  : 'N/A';
                
                html += \`
                  <div class="endpoint">
                    <div class="endpoint-header">
                      <div class="endpoint-name">📡 \${endpoint.name}</div>
                      <div class="endpoint-badge">\${endpoint.events} events</div>
                    </div>
                    <div class="endpoint-info">
                      📅 Last activity: \${lastUpdate}
                    </div>
                    <div class="endpoint-actions">
                      <a href="/logs?endpoint=\${endpoint.name}" target="_blank" class="btn btn-primary">
                        📄 View Logs
                      </a>
                      <button onclick="copyWebhookUrl('\${endpoint.name}')" class="btn btn-secondary">
                        📋 Copy Webhook URL
                      </button>
                      <button onclick="copyZaloUrl('\${endpoint.name}')" class="btn btn-secondary">
                        🔗 Copy Zalo URL
                      </button>
                    </div>
                  </div>
                \`;
              }
            }
            
            document.getElementById('totalEvents').textContent = totalEvents;
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('vi-VN');
            document.getElementById('endpoints').innerHTML = html;
            
          } catch (error) {
            console.error('Error loading data:', error);
          }
          
          statusEl.classList.remove('updating');
        }
        
        function copyWebhookUrl(endpointName) {
          const url = \`https://chungle.io.vn/webhook/\${endpointName}\`;
          navigator.clipboard.writeText(url).then(() => {
            alert('✅ Copied Webhook URL: ' + url);
          });
        }
        
        function copyZaloUrl(endpointName) {
          const url = \`https://zalo.me/{OA_ID}?open_type=c&callback_url=https://chungle.io.vn/webhook/\${endpointName}\`;
          navigator.clipboard.writeText(url).then(() => {
            alert('✅ Copied Zalo URL (remember to replace {OA_ID}): ' + url);
          });
        }
        
        loadData();
        setInterval(loadData, 3000);
      </script>
    </body>
    </html>
  `);
}