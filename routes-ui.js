import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zaloAccounts, loginZaloAccount } from './api/zalo/zalo.js';
import { proxyService } from './proxyService.js';
import { broadcastLoginSuccess, wss, server } from './server.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, 'webhook-config.json');

// Giả lập trạng thái đăng nhập
let isAuthenticated = false;

// Middleware kiểm tra đăng nhập
const requireLogin = (req, res, next) => {
  if (!isAuthenticated) {
    return res.redirect('/login-page');
  }
  next();
};

// Trang gốc
router.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <script>window.location.href = ${isAuthenticated ? "'/home'" : "'/login-page'"};</script>
      </body>
    </html>
  `);
});

// Trang Login
router.get('/login-page', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Đăng Nhập</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
        .login-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; text-align: center; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #2980b9; }
        .error { color: red; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>Đăng Nhập</h2>
        <form action="/login-page" method="POST">
          <input type="text" name="username" placeholder="Tên đăng nhập" required>
          <input type="password" name="password" placeholder="Mật khẩu" required>
          <button type="submit">Đăng Nhập</button>
        </form>
        <p class="error">${req.query.error || ''}</p>
      </div>
    </body>
    </html>
  `);
});

// Xử lý POST đăng nhập
router.post('/login-page', (req, res) => {
  const { username, password } = req.body;
  const validUsername = 'admin';
  const validPassword = '123456';

  if (username === validUsername && password === validPassword) {
    isAuthenticated = true;
    res.redirect('/home');
  } else {
    res.redirect('/login-page?error=Sai tên đăng nhập hoặc mật khẩu');
  }
});

// Trang /home
router.get('/home', requireLogin, (req, res) => {
  let accountsHtml = '<p class="no-data">Chưa có tài khoản nào đăng nhập</p>';
  if (zaloAccounts.length > 0) {
    accountsHtml = '<table><thead><tr><th>Own ID</th><th>Số điện thoại</th><th>Proxy</th><th>Hành động</th></tr></thead><tbody>';
    zaloAccounts.forEach((account) => {
      accountsHtml += `
        <tr>
          <td>${account.ownId}</td>
          <td>${account.phoneNumber || 'N/A'}</td>
          <td>${account.proxy || 'Không có'}</td>
          <td>
            <form action="/deleteAccount" method="POST" style="display:inline;">
              <input type="hidden" name="ownId" value="${account.ownId}">
              <button type="submit" class="delete-btn" onclick="return confirm('Bạn có chắc muốn xóa tài khoản ${account.ownId}?');"><i class="fas fa-trash"></i></button>
            </form>
          </td>
        </tr>`;
    });
    accountsHtml += '</tbody></table>';
  }

  const proxies = proxyService.getPROXIES();
  let proxiesHtml = '<p class="no-data">Chưa có proxy nào</p>';
  if (proxies.length > 0) {
    proxiesHtml = '<table><thead><tr><th>Proxy URL</th><th>Số tài khoản</th><th>Danh sách số</th></tr></thead><tbody>';
    proxies.forEach((proxy) => {
      const accountsList =
        proxy.accounts.length > 0
          ? proxy.accounts.map((acc) => acc.phoneNumber || 'N/A').join(', ')
          : 'Chưa có';
      proxiesHtml += `<tr><td>${proxy.url}</td><td>${proxy.usedCount}</td><td>${accountsList}</td></tr>`;
    });
    proxiesHtml += '</tbody></table>';
  }

  let webhookConfigHtml = '<p class="no-data">Chưa có cấu hình webhook</p>';
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    webhookConfigHtml = `
      <ul>
        <li><i class="fas fa-comment"></i> Message: ${config.messageWebhookUrl || 'N/A'}</li>
        <li><i class="fas fa-users"></i> Group Event: ${config.groupEventWebhookUrl || 'N/A'}</li>
        <li><i class="fas fa-heart"></i> Reaction: ${config.reactionWebhookUrl || 'N/A'}</li>
      </ul>
    `;
  } catch (error) {
    console.error('Lỗi khi đọc cấu hình webhook:', error);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Zalo Bot - Quản Lý</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background-color: #f0f2f5; color: #333; }
        .container { max-width: 100%; padding: 10px; }
        
        /* Header */
        header { background: #3498db; color: white; padding: 15px; text-align: center; position: fixed; top: 0; width: 100%; z-index: 1000; }
        header h1 { font-size: 20px; }

        /* Menu */
        nav { background: #2c3e50; padding: 10px 0; position: fixed; top: 60px; width: 100%; z-index: 999; }
        nav ul { list-style: none; display: flex; justify-content: space-around; flex-wrap: wrap; }
        nav a { color: white; text-decoration: none; padding: 10px; font-size: 14px; display: flex; align-items: center; }
        nav a i { margin-right: 5px; }
        nav a:hover { background: #34495e; border-radius: 5px; }

        /* Main content */
        main { margin-top: 120px; padding: 10px; }
        .section { background: white; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 15px; margin-bottom: 15px; }
        .section h2 { color: #2c3e50; font-size: 18px; margin-bottom: 10px; }
        .no-data { color: #7f8c8d; text-align: center; }

        /* Table */
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f2f2f2; }
        td { word-break: break-word; }

        /* Buttons and Forms */
        .btn { display: inline-block; padding: 8px 15px; margin: 5px 0; background: #3498db; color: white; text-decoration: none; border-radius: 5px; border: none; cursor: pointer; }
        .btn:hover { background: #2980b9; }
        .delete-btn { background: #e74c3c; padding: 5px 10px; }
        .delete-btn:hover { background: #c0392b; }
        .restart-btn { background: #f39c12; }
        .restart-btn:hover { background: #e67e22; }
        form.inline { display: inline; }
        input[type="text"] { padding: 8px; border: 1px solid #ddd; border-radius: 5px; width: 70%; margin-right: 5px; }

        /* Webhook List */
        .section ul { list-style: none; }
        .section ul li { padding: 8px 0; }
        .section ul li i { margin-right: 8px; color: #3498db; }

        /* Responsive */
        @media (max-width: 600px) {
          nav ul { flex-direction: column; align-items: center; }
          nav a { width: 100%; text-align: center; }
          input[type="text"] { width: 100%; margin-bottom: 5px; }
          .btn { width: 100%; }
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Zalo Bot - Quản Lý</h1>
      </header>
      <nav>
        <ul>
          <li><a href="#accounts"><i class="fas fa-user"></i> Tài khoản</a></li>
          <li><a href="#proxies"><i class="fas fa-server"></i> Proxy</a></li>
          <li><a href="#webhooks"><i class="fas fa-link"></i> Webhook</a></li>
          <li><a href="#actions"><i class="fas fa-cogs"></i> Hành động</a></li>
          <li><a href="#guides"><i class="fas fa-book"></i> Hướng dẫn</a></li>
        </ul>
      </nav>
      <main class="container">
        <div class="section" id="accounts">
          <h2>Danh sách tài khoản</h2>
          ${accountsHtml}
          <a href="/login" class="btn"><i class="fas fa-qrcode"></i> Đăng nhập QR</a>
        </div>
        <div class="section" id="proxies">
          <h2>Danh sách Proxy</h2>
          ${proxiesHtml}
          <form action="/proxies" method="POST" class="inline">
            <input type="text" name="proxyUrl" placeholder="Nhập proxy URL" required>
            <button type="submit" class="btn"><i class="fas fa-plus"></i> Thêm</button>
          </form>
          <form action="/proxies" method="POST" class="inline">
            <input type="hidden" name="_method" value="DELETE">
            <input type="text" name="proxyUrl" placeholder="Nhập proxy URL để xóa" required>
            <button type="submit" class="btn"><i class="fas fa-trash"></i> Xóa</button>
          </form>
        </div>
        <div class="section" id="webhooks">
          <h2>Cấu hình Webhook</h2>
          ${webhookConfigHtml}
          <a href="/updateWebhookForm" class="btn"><i class="fas fa-edit"></i> Cập nhật</a>
        </div>
        <div class="section" id="actions">
          <h2>Hành động</h2>
          <form action="/restartApp" method="POST" class="inline">
            <button type="submit" class="btn restart-btn" onclick="return confirm('Bạn có chắc muốn khởi động lại ứng dụng?');"><i class="fas fa-sync"></i> Khởi động lại</button>
          </form>
          <form action="/logout" method="POST" class="inline">
            <button type="submit" class="btn delete-btn"><i class="fas fa-sign-out-alt"></i> Đăng xuất</button>
          </form>
          <a href="/list" class="btn" target="_blank"><i class="fas fa-file-alt"></i> Tài liệu API</a>
        </div>
        <div class="section" id="guides">
          <h2>Hướng dẫn giới hạn Zalo</h2>
          <ul>
            <li><strong>Thời gian nghỉ</strong> giữa 2 lần gửi tin nhắn: <em>60 - 150 giây</em></li>
            <li><strong>Giới hạn gửi tin nhắn/ngày</strong>:
              <ul>
                <li>TK lâu năm (>1 năm): Bắt đầu <strong>30</strong>, tăng +20/3 ngày, tối đa 150.</li>
                <li>TK mới: <strong>10 - 30</strong> tin/ngày.</li>
              </ul>
            </li>
            <li><strong>Giới hạn tìm số/giờ</strong>:
              <ul>
                <li>TK cá nhân: 15 tin/60 phút.</li>
                <li>TK business: 30 tin/60 phút.</li>
              </ul>
            </li>
            <li><strong>Kết bạn</strong>: Tối đa <strong>30 - 35 người/ngày</strong>.</li>
          </ul>
        </div>
      </main>
    </body>
    </html>
  `);
});

// Route xử lý đăng xuất
router.post('/logout', (req, res) => {
  isAuthenticated = false;
  res.redirect('/login-page');
});

// Các route khác (giữ nguyên)
router.get('/login', (req, res) => {
  const loginFile = path.join(__dirname, 'login.html');
  fs.readFile(loginFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Lỗi khi đọc file login.html:', err);
      return res.status(500).send('Không thể tải trang đăng nhập.');
    }
    res.send(data);
  });
});

router.post('/login', async (req, res) => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const { proxy } = req.body;
      const qrCodeImage = await loginZaloAccount(proxy || null, null);
      res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>Quét mã QR</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f0f2f5;
            }
            .qr-container {
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              text-align: center;
              width: 450px;
            }
            h2 {
              color: #2c3e50;
              margin-bottom: 20px;
            }
            img#qrCode {
              max-width: 100%;
              height: auto;
              border: 1px solid #ddd;
              border-radius: 4px;
              padding: 10px;
              background: #fff;
            }
            #retryButton {
              display: none;
              margin-top: 20px;
              padding: 10px 20px;
              background-color: #3498db;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
            }
            #retryButton:hover {
              background-color: #2980b9;
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h2>Quét mã QR để đăng nhập</h2>
            <img id="qrCode" src="${qrCodeImage}" alt="QR Code"/>
            <button id="retryButton" onclick="location.reload()">Thử lại</button>
          </div>
          <script>
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const socket = new WebSocket(protocol + '//' + host);
            socket.onmessage = function(event) {
              console.log('Received:', event.data);
              if (event.data === 'login_success') {
                alert('Đăng nhập thành công. Tự động chuyển về Home sau 3 giây');
                setTimeout(function() {
                  window.location.href = '/home';
                }, 3000);
              } else if (event.data === 'qr_expired') {
                alert('Mã QR đã hết hạn.');
                document.getElementById('retryButton').style.display = 'block';
              }
            };
          </script>
        </body>
        </html>
      `);
      return;
    } catch (error) {
      if (error.message.includes('QR code đã hết hạn') && retryCount < MAX_RETRIES - 1) {
        console.log(`QR code hết hạn, thử lại lần ${retryCount + 1}/${MAX_RETRIES}`);
        retryCount++;
        continue;
      }
      res.status(500).json({ success: false, error: error.message });
      return;
    }
  }
});

router.get('/updateWebhookForm', (req, res) => {
  const docFile = path.join(__dirname, 'updateWebhookForm.html');
  fs.readFile(docFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Lỗi khi đọc file tài liệu:', err);
      return res.status(500).send('Không thể tải tài liệu API.');
    }
    res.send(data);
  });
});

router.get('/list', (req, res) => {
  const docFile = path.join(__dirname, 'api-doc.html');
  fs.readFile(docFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Lỗi khi đọc file tài liệu:', err);
      return res.status(500).send('Không thể tải tài liệu API.');
    }
    res.send(data);
  });
});

router.post('/updateWebhook', (req, res) => {
  const { messageWebhookUrl, groupEventWebhookUrl, reactionWebhookUrl } = req.body;
  if (!messageWebhookUrl || !messageWebhookUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'messageWebhookUrl không hợp lệ' });
  }
  if (!groupEventWebhookUrl || !groupEventWebhookUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'groupEventWebhookUrl không hợp lệ' });
  }
  if (!reactionWebhookUrl || !reactionWebhookUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'reactionWebhookUrl không hợp lệ' });
  }
  const config = { messageWebhookUrl, groupEventWebhookUrl, reactionWebhookUrl };
  fs.writeFile(configPath, JSON.stringify(config, null, 2), (err) => {
    if (err) {
      console.error('Lỗi khi ghi file cấu hình:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.send(`
      <html>
        <body>
          <script>window.location.href = '/home';</script>
        </body>
      </html>
    `);
  });
});

router.get('/proxies', (req, res) => {
  res.json({ success: true, data: proxyService.getPROXIES() });
});

router.post('/proxies', (req, res) => {
  const { proxyUrl, _method } = req.body;
  if (_method === 'DELETE') {
    if (!proxyUrl || !proxyUrl.trim()) {
      return res.status(400).json({ success: false, error: 'proxyUrl không hợp lệ' });
    }
    try {
      proxyService.removeProxy(proxyUrl);
      res.send(`
        <html>
          <body>
            <script>window.location.href = '/home';</script>
          </body>
        </html>
      `);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    if (!proxyUrl || !proxyUrl.trim()) {
      return res.status(400).json({ success: false, error: 'proxyUrl không hợp lệ' });
    }
    try {
      const newProxy = proxyService.addProxy(proxyUrl);
      res.send(`
        <html>
          <body>
            <script>window.location.href = '/home';</script>
          </body>
        </html>
      `);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

router.post('/deleteAccount', (req, res) => {
  const { ownId } = req.body;
  if (!ownId) {
    return res.status(400).json({ success: false, error: 'ownId không hợp lệ' });
  }

  const accountIndex = zaloAccounts.findIndex((acc) => acc.ownId === ownId);
  if (accountIndex === -1) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
  }

  const account = zaloAccounts[accountIndex];
  if (account.api && account.api.listener) {
    account.api.listener.stop();
  }

  const cookieFile = path.join(__dirname, 'cookies', `cred_${ownId}.json`);
  if (fs.existsSync(cookieFile)) {
    fs.unlinkSync(cookieFile);
    console.log(`Đã xóa file cookie cho tài khoản ${ownId}`);
  }

  zaloAccounts.splice(accountIndex, 1);
  console.log(`Đã xóa tài khoản ${ownId} khỏi hệ thống`);

  if (account.proxy) {
    proxyService.removeAccountFromProxy(account.proxy, ownId);
  }

  res.send(`
    <html>
      <body>
        <script>window.location.href = '/home';</script>
      </body>
    </html>
  `);
});

router.post('/restartApp', (req, res) => {
  console.log('Bắt đầu khởi động lại ứng dụng...');
  zaloAccounts.forEach((account) => {
    if (account.api && account.api.listener) {
      account.api.listener.stop();
    }
  });

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.close();
    }
  });
  wss.close(() => {
    console.log('WebSocket server đã đóng');
  });

  server.close(async (err) => {
    if (err) {
      console.error('Lỗi khi đóng HTTP server:', err);
      res.status(500).send('Lỗi khi khởi động lại ứng dụng');
      return;
    }
    console.log('HTTP server đã đóng');

    while (zaloAccounts.length > 0) {
      zaloAccounts.pop();
    }

    const cookiesDir = path.join(__dirname, 'cookies');
    if (fs.existsSync(cookiesDir)) {
      const cookieFiles = fs.readdirSync(cookiesDir);
      for (const file of cookieFiles) {
        if (file.startsWith('cred_') && file.endsWith('.json')) {
          const ownId = file.substring(5, file.length - 5);
          try {
            const cookie = JSON.parse(fs.readFileSync(`${cookiesDir}/${file}`, 'utf-8'));
            await loginZaloAccount(null, cookie);
            console.log(`Đã đăng nhập lại tài khoản ${ownId} từ cookie`);
          } catch (error) {
            console.error(`Lỗi khi đăng nhập lại tài khoản ${ownId}:`, error);
          }
        }
      }
    }

    server.listen(3000, '0.0.0.0', () => {
      console.log('HTTP server đã khởi động lại');
      res.send(`
        <html>
          <body>
            <script>
              alert('Ứng dụng đã được khởi động lại thành công!');
              window.location.href = '/home';
            </script>
          </body>
        </html>
      `);
    });
  });
});

export default router;