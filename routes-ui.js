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
      <title>API Server Zalo</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background-color: #f0f2f5; color: #333; }
        .container { max-width: 100%; padding: 10px; }
        
        /* Header */
        header { background: #3498db; color: white; padding: 15px; text-align: center; position: fixed; top: 0; width: 100%; z-index: 1000; }
        header h1 { font-size: 20px; }

        /* Tabs */
        .tab-container { margin-top: -10px; position: fixed; top: 60px; width: 100%; background: #2c3e50; z-index: 999; }
        .tab-buttons { display: flex; justify-content: space-around; flex-wrap: wrap; }
        .tab-button { flex: 1; padding: 15px; text-align: center; color: white; background: #2c3e50; border: none; cursor: pointer; font-size: 14px; transition: background 0.3s; }
        .tab-button:hover { background: #34495e; }
        .tab-button.active { background: #c0392b; }
        .tab-button i { margin-right: 5px; }

        /* Main content */
        .tab-content { display: none; margin-top: 120px; padding: 10px; }
        .tab-content.active { display: block; }
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
        .delete-btn { background: #e74c3c;}
		.delete-btn { background: #2980b9;}
        .delete-btn:hover { background: #c0392b; }
        .restart-btn { background: #f39c12; }
        .restart-btn:hover { background: #e67e22; }
        form.inline { display: inline; }
        input[type="text"] { padding: 8px; border: 1px solid #ddd; border-radius: 5px; width: 70%; margin-right: 5px; }

        /* Webhook List */
        .section ul { list-style: none; }
        .section ul li { padding: 8px 0; }
        .section ul li i { margin-right: 8px; color: #3498db; }

        /* API Docs */
        .api-docs { line-height: 1.6; }
        .api-docs h1, .api-docs h2, .api-docs h3 { color: #333; }
        .api-docs table { border-collapse: collapse; width: 100%; }
        .api-docs th, .api-docs td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        .api-docs th { background-color: #f4f4f4; }
        .api-docs pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }

        /* Responsive */
        @media (max-width: 600px) {
          .tab-buttons { flex-direction: column; }
          .tab-button { width: 100%; }
          input[type="text"] { width: 100%; margin-bottom: 5px; }
          .btn { width: 100%; }
        }
      </style>
    </head>
    <body>
      <header>
        <h1>API Server Zalo - 1TouchPro</h1>
      </header>
      <div class="tab-container">
        <div class="tab-buttons">
          <button class="tab-button active" data-tab="accounts"><i class="fas fa-user"></i> Tài khoản</button>
          <button class="tab-button" data-tab="proxies"><i class="fas fa-server"></i> Proxy</button>
          <button class="tab-button" data-tab="webhooks"><i class="fas fa-link"></i> Webhook</button>
          <button class="tab-button" data-tab="guides"><i class="fas fa-book"></i> Hướng dẫn</button>
          <button class="tab-button" data-tab="api-docs"><i class="fas fa-file-alt"></i> Hướng Dẫn API</button>
		  <button class="tab-button" data-tab="actions"><i class="fas fa-cogs"></i> Hành động</button>
        </div>
      </div>
      <main class="container">
        <div class="tab-content active" id="accounts">
          <div class="section">
            <h2>Danh sách tài khoản</h2>
            ${accountsHtml}
            <a href="/login" class="btn"><i class="fas fa-qrcode"></i> Đăng nhập QR</a>
          </div>
        </div>
        <div class="tab-content" id="proxies">
          <div class="section">
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
        </div>
        <div class="tab-content" id="webhooks">
          <div class="section">
            <h2>Cấu hình Webhook</h2>
            ${webhookConfigHtml}
            <a href="/updateWebhookForm" class="btn"><i class="fas fa-edit"></i> Cập nhật</a>
          </div>
        </div>
        <div class="tab-content" id="actions">
          <div class="section">
            <h2>Hành động</h2>
            <form action="/restartApp" method="POST" class="inline">
              <button type="submit" class="btn restart-btn" onclick="return confirm('Bạn có chắc muốn khởi động lại ứng dụng?');"><i class="fas fa-sync"></i> Khởi động lại</button>
            </form>
            <form action="/logout" method="POST" class="inline">
              <button type="submit" class="btn delete-btn"><i class="fas fa-sign-out-alt"></i> Đăng xuất</button>
            </form>
          </div>
        </div>
        <div class="tab-content" id="guides">
          <div class="section">
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
        </div>
        <div class="tab-content" id="api-docs">
          <div class="section api-docs">
            <h1>Tài liệu API Zalo Server</h1>
            <h2>Mục lục</h2>
            <ol style="margin-left: 22px;">
              <li><a href="#findUser">findUser</a></li>
              <li><a href="#getUserInfo">getUserInfo</a></li>
              <li><a href="#sendFriendRequest">sendFriendRequest</a></li>
              <li><a href="#sendMessage">sendMessage</a></li>
              <li><a href="#createGroup">createGroup</a></li>
              <li><a href="#getGroupInfo">getGroupInfo</a></li>
              <li><a href="#addUserToGroup">addUserToGroup</a></li>
              <li><a href="#removeUserFromGroup">removeUserFromGroup</a></li>
              <li><a href="#sendImageToUser">sendImageToUser</a></li>
              <li><a href="#sendImagesToUser">sendImagesToUser</a></li>
              <li><a href="#sendImageToGroup">sendImageToGroup</a></li>
              <li><a href="#sendImagesToGroup">sendImagesToGroup</a></li>
              <li><a href="#accounts">accounts</a></li>
            </ol>
            <hr/>
            <h3 id="findUser">1. findUser</h3>
            <p><strong>Mục đích:</strong> Tìm kiếm người dùng dựa trên số điện thoại.</p>
            <p><strong>Endpoint:</strong> POST /findUser</p>
            <p><strong>Parameters:</strong></p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>phone</td><td>string</td><td>Số điện thoại của người dùng.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <p><strong>Ví dụ:</strong></p>
            <pre>
{
  "phone": "0123456789",
  "ownId": "0000000000000000001"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "phone": "0123456789",
  "ownId": "0000000000000000001"
}' http://localhost:3000/findUser
            </pre>
            <hr/>
            <h3 id="getUserInfo">2. getUserInfo</h3>
            <p><strong>Mục đích:</strong> Lấy thông tin chi tiết của một người dùng.</p>
            <p><strong>Endpoint:</strong> POST /getUserInfo</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>userId</td><td>string</td><td>ID của người dùng cần lấy thông tin.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "userId": "0000000000000000001",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "userId": "0000000000000000001",
  "ownId": "0000000000000000009"
}' http://localhost:3000/getUserInfo
            </pre>
            <hr/>
            <h3 id="sendFriendRequest">3. sendFriendRequest</h3>
            <p><strong>Mục đích:</strong> Gửi lời mời kết bạn đến người dùng.</p>
            <p><strong>Endpoint:</strong> POST /sendFriendRequest</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>userId</td><td>string</td><td>ID của người dùng nhận lời mời.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "userId": "0000000000000000002",
  "ownId": "0000000000000000001"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "userId": "0000000000000000002",
  "ownId": "0000000000000000001"
}' http://localhost:3000/sendFriendRequest
            </pre>
            <hr/>
            <h3 id="sendMessage">4. sendMessage</h3>
            <p><strong>Mục đích:</strong> Gửi tin nhắn văn bản (hoặc object) đến người dùng hoặc nhóm.</p>
            <p><strong>Endpoint:</strong> POST /sendmessage</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>message</td><td>string | Object</td><td>Nội dung tin nhắn (có thể là string hoặc object MessageContent).</td><td>Có</td></tr>
              <tr><td>threadId</td><td>string</td><td>ID của người dùng/nhóm để gửi tin.</td><td>Có</td></tr>
              <tr><td>type</td><td>string</td><td>Loại thread ("User" hoặc "Group"). Mặc định là "User".</td><td>Không</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "message": "Xin chào",
  "threadId": "0000000000000000001",
  "type": "User",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "message": "Xin chào",
  "threadId": "0000000000000000001",
  "type": "User",
  "ownId": "0000000000000000009"
}' http://localhost:3000/sendmessage
            </pre>
            <hr/>
            <h3 id="createGroup">5. createGroup</h3>
            <p><strong>Mục đích:</strong> Tạo một nhóm mới.</p>
            <p><strong>Endpoint:</strong> POST /createGroup</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>members</td><td>string[]</td><td>Mảng ID các thành viên (không bao gồm bản thân).</td><td>Có</td></tr>
              <tr><td>name</td><td>string</td><td>Tên của nhóm.</td><td>Không</td></tr>
              <tr><td>avatarPath</td><td>string</td><td>Đường dẫn ảnh nhóm (nếu có).</td><td>Không</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "members": ["0000000000000000002", "0000000000000000003"],
  "name": "Nhóm Mới",
  "avatarPath": "./avatar.jpg",
  "ownId": "0000000000000000001"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "members": ["0000000000000000002", "0000000000000000003"],
  "name": "Nhóm Mới",
  "avatarPath": "./avatar.jpg",
  "ownId": "0000000000000000001"
}' http://localhost:3000/createGroup
            </pre>
            <hr/>
            <h3 id="getGroupInfo">6. getGroupInfo</h3>
            <p><strong>Mục đích:</strong> Lấy thông tin chi tiết của các nhóm.</p>
            <p><strong>Endpoint:</strong> POST /getGroupInfo</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>groupId</td><td>string | string[]</td><td>ID của nhóm hoặc mảng các ID.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "groupId": "0000000000000000000",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "groupId": "0000000000000000000",
  "ownId": "0000000000000000009"
}' http://localhost:3000/getGroupInfo
            </pre>
            <hr/>
            <h3 id="addUserToGroup">7. addUserToGroup</h3>
            <p><strong>Mục đích:</strong> Thêm thành viên vào nhóm.</p>
            <p><strong>Endpoint:</strong> POST /addUserToGroup</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>groupId</td><td>string</td><td>ID của nhóm.</td><td>Có</td></tr>
              <tr><td>memberId</td><td>string | string[]</td><td>ID của thành viên (hoặc mảng ID) cần thêm vào nhóm.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "groupId": "0000000000000000000",
  "memberId": ["0000000000000000001", "0000000000000000002"],
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "groupId": "0000000000000000000",
  "memberId": ["0000000000000000001", "0000000000000000002"],
  "ownId": "0000000000000000009"
}' http://localhost:3000/addUserToGroup
            </pre>
            <hr/>
            <h3 id="removeUserFromGroup">8. removeUserFromGroup</h3>
            <p><strong>Mục đích:</strong> Xóa thành viên khỏi nhóm.</p>
            <p><strong>Endpoint:</strong> POST /removeUserFromGroup</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>groupId</td><td>string</td><td>ID của nhóm.</td><td>Có</td></tr>
              <tr><td>memberId</td><td>string | string[]</td><td>ID của thành viên (hoặc mảng ID) cần xóa khỏi nhóm.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "groupId": "0000000000000000000",
  "memberId": ["0000000000000000001", "0000000000000000002"],
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "groupId": "0000000000000000000",
  "memberId": ["0000000000000000001", "0000000000000000002"],
  "ownId": "0000000000000000009"
}' http://localhost:3000/removeUserFromGroup
            </pre>
            <hr/>
            <h3 id="sendImageToUser">9. sendImageToUser</h3>
            <p><strong>Mục đích:</strong> Gửi một hình ảnh đến người dùng.</p>
            <p><strong>Endpoint:</strong> POST /sendImageToUser</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>imagePath</td><td>string</td><td>Đường dẫn hoặc URL đến hình ảnh cần gửi.</td><td>Có</td></tr>
              <tr><td>threadId</td><td>string</td><td>ID của người dùng nhận tin nhắn.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "imagePath": "./path/to/image.jpg",
  "threadId": "0000000000000000001",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "imagePath": "./path/to/image.jpg",
  "threadId": "0000000000000000001",
  "ownId": "0000000000000000009"
}' http://localhost:3000/sendImageToUser
            </pre>
            <hr/>
            <h3 id="sendImagesToUser">10. sendImagesToUser</h3>
            <p><strong>Mục đích:</strong> Gửi nhiều hình ảnh đến người dùng.</p>
            <p><strong>Endpoint:</strong> POST /sendImagesToUser</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>imagePaths</td><td>string[]</td><td>Mảng đường dẫn hoặc URL hình ảnh.</td><td>Có</td></tr>
              <tr><td>threadId</td><td>string</td><td>ID của người dùng nhận tin nhắn.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "imagePaths": ["./path/to/image1.jpg", "./path/to/image2.jpg"],
  "threadId": "0000000000000000001",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "imagePaths": ["./path/to/image1.jpg", "./path/to/image2.jpg"],
  "threadId": "0000000000000000001",
  "ownId": "0000000000000000009"
}' http://localhost:3000/sendImagesToUser
            </pre>
            <hr/>
            <h3 id="sendImageToGroup">11. sendImageToGroup</h3>
            <p><strong>Mục đích:</strong> Gửi một hình ảnh đến nhóm.</p>
            <p><strong>Endpoint:</strong> POST /sendImageToGroup</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>imagePath</td><td>string</td><td>Đường dẫn hoặc URL đến hình ảnh cần gửi.</td><td>Có</td></tr>
              <tr><td>threadId</td><td>string</td><td>ID của nhóm nhận tin nhắn.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "imagePath": "./path/to/group-image.jpg",
  "threadId": "0000000000000000000",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "imagePath": "./path/to/group-image.jpg",
  "threadId": "0000000000000000000",
  "ownId": "0000000000000000009"
}' http://localhost:3000/sendImageToGroup
            </pre>
            <hr/>
            <h3 id="sendImagesToGroup">12. sendImagesToGroup</h3>
            <p><strong>Mục đích:</strong> Gửi nhiều hình ảnh đến nhóm.</p>
            <p><strong>Endpoint:</strong> POST /sendImagesToGroup</p>
            <table>
              <tr><th>Field</th><th>Loại</th><th>Mô tả</th><th>Bắt buộc</th></tr>
              <tr><td>imagePaths</td><td>string[]</td><td>Mảng đường dẫn hoặc URL hình ảnh.</td><td>Có</td></tr>
              <tr><td>threadId</td><td>string</td><td>ID của nhóm nhận tin nhắn.</td><td>Có</td></tr>
              <tr><td>ownId</td><td>string</td><td>ID tài khoản Zalo đang đăng nhập (lấy từ /accounts).</td><td>Có</td></tr>
            </table>
            <pre>
{
  "imagePaths": ["./path/to/group-image1.jpg", "./path/to/group-image2.jpg"],
  "threadId": "0000000000000000000",
  "ownId": "0000000000000000009"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl -X POST -H "Content-Type: application/json" -d '{
  "imagePaths": ["./path/to/group-image1.jpg", "./path/to/group-image2.jpg"],
  "threadId": "0000000000000000000",
  "ownId": "0000000000000000009"
}' http://localhost:3000/sendImagesToGroup
            </pre>
            <hr/>
            <h3 id="accounts">13. accounts</h3>
            <p><strong>Mục đích:</strong> Lấy danh sách tài khoản đã đăng nhập.</p>
            <p><strong>Endpoint:</strong> GET /accounts</p>
            <p><strong>Response:</strong></p>
            <pre>
// Nếu có tài khoản đã đăng nhập, dữ liệu trả về sẽ hiển thị dạng bảng.
// Ví dụ (dạng JSON thuần):
[
  {
    "ownId": "0000000000000000001",
    "proxy": "http://proxy.example.com",
    "phoneNumber": "0123456789"
  },
  {
    "ownId": "0000000000000000002",
    "proxy": null,
    "phoneNumber": "N/A"
  }
]

// Nếu chưa có tài khoản nào đăng nhập:
{
  "success": true,
  "message": "Chưa có tài khoản nào đăng nhập"
}
            </pre>
            <p><strong>Ví dụ curl:</strong></p>
            <pre>
curl http://localhost:3000/accounts
            </pre>
          </div>
        </div>
      </main>
      <script>
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
          button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
          });
        });
      </script>
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
