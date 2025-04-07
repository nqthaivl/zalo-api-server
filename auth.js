// auth.js - Quản lý xác thực người dùng
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đến file lưu thông tin đăng nhập
const userFilePath = path.join(__dirname, 'zalo_data', 'users.json');

// Tạo file users.json nếu chưa tồn tại
const initUserFile = () => {
  if (!fs.existsSync(path.join(__dirname, 'zalo_data'))) {
    fs.mkdirSync(path.join(__dirname, 'zalo_data'), { recursive: true });
  }
  
  if (!fs.existsSync(userFilePath)) {
    // Tạo mật khẩu mặc định 'admin' cho người dùng 'admin'
    const defaultPassword = 'admin';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');
    
    const users = [{
      username: 'admin',
      salt,
      hash
    }];
    
    fs.writeFileSync(userFilePath, JSON.stringify(users, null, 2));
    console.log('Đã tạo file users.json với tài khoản mặc định: admin/admin');
  }
};

// Khởi tạo file người dùng
initUserFile();

// Đọc dữ liệu người dùng từ file
const getUsers = () => {
  try {
    const data = fs.readFileSync(userFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Lỗi khi đọc file users.json:', error);
    return [];
  }
};

// Thêm người dùng mới
export const addUser = (username, password) => {
  const users = getUsers();
  
  // Kiểm tra nếu username đã tồn tại
  if (users.some(user => user.username === username)) {
    return false;
  }
  
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  
  users.push({
    username,
    salt,
    hash
  });
  
  fs.writeFileSync(userFilePath, JSON.stringify(users, null, 2));
  return true;
};

// Xác thực người dùng
export const validateUser = (username, password) => {
  const users = getUsers();
  const user = users.find(user => user.username === username);
  
  if (!user) {
    return false;
  }
  
  const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
  return user.hash === hash;
};

// Middleware xác thực cho các route
export const authMiddleware = (req, res, next) => {
  // Kiểm tra nếu đã đăng nhập (thông qua session)
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // Chuyển hướng về trang đăng nhập
  res.redirect('/admin-login');
};

// Danh sách các route công khai (không cần xác thực)
export const publicRoutes = ['/admin-login', '/api']; 