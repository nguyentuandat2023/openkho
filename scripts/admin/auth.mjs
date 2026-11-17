// Xác thực trang Quản trị.
//   - Mặc định chỉ lắng nghe 127.0.0.1 (chỉ người dùng trên chính máy này truy cập được).
//   - Đặt ADMIN_PASSWORD (trong .env.local, KHÔNG commit) để bắt buộc đăng nhập; bắt buộc khi mở ra mạng (ADMIN_HOST ≠ 127.0.0.1).
//   - Phiên đăng nhập: cookie HttpOnly, SameSite=Strict, ký HMAC-SHA256; hết hạn sau 12 giờ.
//   - Chống dò mật khẩu: tối đa 5 lần sai / 15 phút / địa chỉ IP.
import crypto from 'node:crypto';

const COOKIE = 'okadmin';
const TTL_MS = 12 * 3600_000;
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;

export function isLoopback(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function createAuth({ password = process.env.ADMIN_PASSWORD || '', secret = process.env.ADMIN_SESSION_SECRET || '', now = () => Date.now() } = {}) {
  const key = secret ? crypto.createHash('sha256').update(secret).digest() : crypto.randomBytes(32);
  const pwHash = password ? crypto.createHash('sha256').update(password, 'utf8').digest() : null;
  const fails = new Map(); // ip → [timestamps]

  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

  function issue() {
    const payload = Buffer.from(JSON.stringify({ exp: now() + TTL_MS, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function verify(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return false;
    const [payload, mac] = token.split('.');
    const expect = sign(payload);
    const a = Buffer.from(mac || '');
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    try {
      const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return Number.isFinite(exp) && exp > now();
    } catch {
      return false;
    }
  }

  function cookieFrom(req) {
    const raw = req.headers.cookie || '';
    for (const part of raw.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  }

  function limited(ip) {
    const t = now();
    const arr = (fails.get(ip) || []).filter((x) => t - x < WINDOW_MS);
    fails.set(ip, arr);
    return arr.length >= MAX_FAILS;
  }

  return {
    required: Boolean(pwHash),
    /** Yêu cầu hiện tại đã đăng nhập chưa (luôn đúng khi không đặt mật khẩu). */
    ok(req) {
      return !pwHash || verify(cookieFrom(req));
    },
    /** Đăng nhập: trả về { ok, cookie?, status, error? } */
    login(req, password) {
      const ip = req.socket?.remoteAddress || 'unknown';
      if (!pwHash) return { ok: true, status: 200 };
      if (limited(ip)) return { ok: false, status: 429, error: 'Sai mật khẩu quá nhiều lần — thử lại sau 15 phút.' };
      const given = crypto.createHash('sha256').update(String(password || ''), 'utf8').digest();
      if (!crypto.timingSafeEqual(given, pwHash)) {
        fails.get(ip).push(now());
        return { ok: false, status: 401, error: 'Sai mật khẩu.' };
      }
      fails.delete(ip);
      return { ok: true, status: 200, cookie: `${COOKIE}=${issue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}` };
    },
    logoutCookie() {
      return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    },
    _verify: verify,
    _issue: issue,
  };
}
