// eventListeners.js
import { GroupEventType } from 'zca-js';
import { getWebhookUrl, triggerN8nWebhook } from './helpers.js';
import fs from 'fs';
import { loginZaloAccount, zaloAccounts } from './api/zalo/zalo.js';
import { broadcastLoginSuccess } from './server.js';

export const reloginAttempts = new Map();
const RELOGIN_COOLDOWN = 5 * 60 * 1000;

export function setupEventListeners(api, loginResolve) {
  api.listener.on('message', (msg) => {
    const messageWebhookUrl = getWebhookUrl('messageWebhookUrl');
    if (messageWebhookUrl) {
      triggerN8nWebhook(msg, messageWebhookUrl);
    }
  });

  api.listener.on('group_event', (data) => {
    const groupEventWebhookUrl = getWebhookUrl('groupEventWebhookUrl');
    if (groupEventWebhookUrl) {
      triggerN8nWebhook(data, groupEventWebhookUrl);
    }
  });

  api.listener.on('reaction', (reaction) => {
    const reactionWebhookUrl = getWebhookUrl('reactionWebhookUrl');
    console.log('Nhận reaction:', reaction);
    if (reactionWebhookUrl) {
      triggerN8nWebhook(reaction, reactionWebhookUrl);
    }
  });

  api.listener.onConnected(() => {
    console.log('Connected');
    loginResolve('login_success');
    broadcastLoginSuccess();
  });

  api.listener.onClosed(() => {
    console.log('Closed - API listener đã ngắt kết nối');
    handleRelogin(api);
  });

  api.listener.onError((error) => {
      console.error('Error:', error);
      if (error.message.includes('QR expired')) {
          console.log('QR code đã hết hạn, thông báo cho client...');
          broadcastLoginSuccess('qr_expired'); // Thông báo qua WebSocket
      }
  });
}

async function handleRelogin(api) {
  try {
    console.log('Đang thử đăng nhập lại...');
    const ownId = api.getOwnId();
    if (!ownId) {
      console.error('Không thể xác định ownId, không thể đăng nhập lại');
      return;
    }

    const lastReloginTime = reloginAttempts.get(ownId);
    const now = Date.now();
    if (lastReloginTime && now - lastReloginTime < RELOGIN_COOLDOWN) {
      console.log(
        `Bỏ qua việc đăng nhập lại tài khoản ${ownId}, đã thử cách đây ${Math.floor(
          (now - lastReloginTime) / 1000
        )} giây`
      );
      return;
    }

    reloginAttempts.set(ownId, now);
    const accountInfo = zaloAccounts.find((acc) => acc.ownId === ownId);
    const customProxy = accountInfo?.proxy || null;
    const cookiesDir = './cookies';
    const cookieFile = `${cookiesDir}/cred_${ownId}.json`;

    if (!fs.existsSync(cookieFile)) {
      console.error(`Không tìm thấy file cookie cho tài khoản ${ownId}`);
      return;
    }

    const cookie = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    console.log(`Đang đăng nhập lại tài khoản ${ownId} với proxy ${customProxy || 'không có'}...`);
    await loginZaloAccount(customProxy, cookie);
    console.log(`Đã đăng nhập lại thành công tài khoản ${ownId}`);
  } catch (error) {
    console.error('Lỗi khi thử đăng nhập lại:', error);
  }
}
