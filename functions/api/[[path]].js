import { seedProducts } from '../_shared/seeds.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const PAID_STATUSES = new Set(['Đã thanh toán', 'Đang xử lý', 'Đang giao', 'Hoàn tất']);
const ORDER_STATUSES = ['Chờ xử lý', 'Chờ thanh toán', 'Đã thanh toán', 'Đang xử lý', 'Đang giao', 'Hoàn tất', 'Đã hủy'];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw new Error('Dữ liệu gửi lên không hợp lệ.'); }
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function hmac(secret, value, algorithm = 'SHA-256') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function cookieValue(request) {
  return (request.headers.get('Cookie') || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('computech_session='))?.slice('computech_session='.length) || '';
}

async function isAdmin(request, env) {
  if (!env.ADMIN_USER || !env.SESSION_SECRET) return false;
  const [payload, signature, ...extra] = cookieValue(request).split('.');
  if (!payload || !signature || extra.length) return false;
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const session = JSON.parse(decodeBase64Url(payload));
    return session.user === env.ADMIN_USER && session.exp > Date.now();
  } catch { return false; }
}

function adminCookie(payload, signature) {
  return `computech_session=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;
}

async function requireAdmin(request, env) {
  return isAdmin(request, env);
}

async function database(env) {
  if (!env.DB) throw new Error('Cloudflare D1 chưa được kết nối. Hãy tạo D1 và gắn binding tên DB trong cài đặt Pages.');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price INTEGER NOT NULL CHECK(price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      badge TEXT NOT NULL DEFAULT '', specs TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#22d3ee',
      shape TEXT NOT NULL DEFAULT 'box', description TEXT NOT NULL DEFAULT ''
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payment TEXT NOT NULL,
      status TEXT NOT NULL, total INTEGER NOT NULL, customer_json TEXT NOT NULL, items_json TEXT NOT NULL
    )`),
  ]);
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM products').first();
  if (Number(count?.total || 0) === 0) {
    const statements = seedProducts.map((product) => env.DB.prepare(
      'INSERT OR IGNORE INTO products (id,name,category,price,stock,badge,specs,color,shape,description) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(product.id, product.name, product.category, product.price, product.stock, product.badge, product.specs, product.color, product.shape, product.description));
    await env.DB.batch(statements);
  }
  return env.DB;
}

function productFromRow(row) {
  return {
    id: row.id, name: row.name, category: row.category, price: Number(row.price), stock: Number(row.stock),
    badge: row.badge, specs: row.specs, color: row.color, shape: row.shape, description: row.description,
  };
}

async function listProducts(db) {
  const result = await db.prepare('SELECT * FROM products ORDER BY rowid DESC').all();
  return (result.results || []).map(productFromRow);
}

function vnpayCanonical(params) {
  return [...params.entries()].filter(([key]) => key.startsWith('vnp_'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
    .join('&');
}

function vnpayDate(date) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

async function verifyVnpay(params, secret) {
  if (!secret) return false;
  const received = params.get('vnp_SecureHash') || '';
  params.delete('vnp_SecureHash');
  params.delete('vnp_SecureHashType');
  return constantTimeEqual(received.toLowerCase(), await hmac(secret, vnpayCanonical(params), 'SHA-512'));
}

async function handleApi(request, env, url) {
  const route = url.pathname;
  const method = request.method;
  const db = await database(env);

  if (method === 'GET' && route === '/api/products') return json({ products: await listProducts(db) });
  if (method === 'GET' && route === '/api/config') {
    const vnpayEnabled = Boolean(env.VNPAY_TMN_CODE && env.VNPAY_HASH_SECRET);
    return json({ vnpayEnabled, demoMode: !vnpayEnabled });
  }

  if (method === 'POST' && route === '/api/admin/login') {
    const body = await readJson(request);
    if (!env.ADMIN_USER || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail('Chưa thiết lập thông tin quản trị trong Cloudflare Secrets.', 503);
    if (String(body.username || '') !== env.ADMIN_USER || String(body.password || '') !== env.ADMIN_PASSWORD) return fail('Tên đăng nhập hoặc mật khẩu chưa đúng.', 401);
    const payload = encodeBase64Url(JSON.stringify({ user: env.ADMIN_USER, exp: Date.now() + 8 * 60 * 60 * 1000 }));
    const signature = await hmac(env.SESSION_SECRET, payload);
    return json({ ok: true }, 200, { 'Set-Cookie': adminCookie(payload, signature) });
  }

  if (method === 'POST' && route === '/api/admin/logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': 'computech_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (method === 'GET' && route === '/api/admin/summary') {
    if (!await requireAdmin(request, env)) return fail('Vui lòng đăng nhập quản trị.', 401);
    const [ordersResult, products] = await Promise.all([
      db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(), listProducts(db),
    ]);
    const orders = (ordersResult.results || []).map((row) => ({
      id: row.id, createdAt: row.created_at, payment: row.payment, status: row.status, total: Number(row.total),
      customer: JSON.parse(row.customer_json), items: JSON.parse(row.items_json),
    }));
    const revenue = orders.filter((order) => PAID_STATUSES.has(order.status)).reduce((sum, order) => sum + order.total, 0);
    return json({ orders, products, revenue, orderCount: orders.length, customerCount: new Set(orders.map((order) => order.customer.email)).size });
  }

  if (method === 'POST' && route === '/api/admin/products') {
    if (!await requireAdmin(request, env)) return fail('Vui lòng đăng nhập quản trị.', 401);
    const body = await readJson(request);
    const price = Number(body.price);
    if (!body.name || !body.category || !Number.isFinite(price) || price < 0) return fail('Tên, danh mục và giá hợp lệ là bắt buộc.');
    const product = {
      id: `sp-${crypto.randomUUID()}`, name: String(body.name).slice(0, 100), category: String(body.category).slice(0, 40),
      price, stock: Math.max(0, Number(body.stock) || 0), badge: String(body.badge || 'Mới').slice(0, 30),
      specs: String(body.specs || '').slice(0, 140), color: String(body.color || '#22d3ee'), shape: 'box',
      description: String(body.description || '').slice(0, 500),
    };
    await db.prepare('INSERT INTO products (id,name,category,price,stock,badge,specs,color,shape,description) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(product.id, product.name, product.category, product.price, product.stock, product.badge, product.specs, product.color, product.shape, product.description).run();
    return json({ product }, 201);
  }

  if (method === 'PATCH' && route.startsWith('/api/admin/products/')) {
    if (!await requireAdmin(request, env)) return fail('Vui lòng đăng nhập quản trị.', 401);
    const id = decodeURIComponent(route.split('/').pop());
    const body = await readJson(request);
    const current = await db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
    if (!current) return fail('Không tìm thấy sản phẩm.', 404);
    const next = { ...productFromRow(current) };
    if (body.price !== undefined) {
      if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0) return fail('Giá sản phẩm không hợp lệ.');
      next.price = Number(body.price);
    }
    if (body.stock !== undefined) {
      if (!Number.isFinite(Number(body.stock)) || Number(body.stock) < 0) return fail('Tồn kho không hợp lệ.');
      next.stock = Number(body.stock);
    }
    if (body.name) next.name = String(body.name).slice(0, 100);
    if (body.category) next.category = String(body.category).slice(0, 40);
    await db.prepare('UPDATE products SET name=?,category=?,price=?,stock=? WHERE id=?').bind(next.name, next.category, next.price, next.stock, id).run();
    return json({ product: next });
  }

  if (method === 'PATCH' && route.startsWith('/api/admin/orders/')) {
    if (!await requireAdmin(request, env)) return fail('Vui lòng đăng nhập quản trị.', 401);
    const id = decodeURIComponent(route.split('/').pop());
    const body = await readJson(request);
    if (!ORDER_STATUSES.includes(body.status)) return fail('Trạng thái không hợp lệ.');
    const result = await db.prepare('UPDATE orders SET status=? WHERE id=?').bind(body.status, id).run();
    if (!result.meta?.changes) return fail('Không tìm thấy đơn hàng.', 404);
    return json({ order: { id, status: body.status } });
  }

  if (method === 'POST' && route === '/api/orders') {
    const body = await readJson(request);
    const customerInput = body.customer || {};
    if (!Array.isArray(body.items) || !body.items.length) return fail('Giỏ hàng đang trống.');
    if (!customerInput.name || !customerInput.phone || !customerInput.email || !customerInput.city || !customerInput.address) return fail('Vui lòng nhập đủ thông tin nhận hàng.');
    if (!['cod', 'vnpay'].includes(body.payment)) return fail('Phương thức thanh toán không hợp lệ.');
    if (body.payment === 'vnpay' && (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET)) return fail('VNPay chưa được cấu hình merchant. Hiện bạn có thể đặt đơn COD.', 503);

    const requested = new Map();
    for (const row of body.items) {
      if (!row?.id) continue;
      const quantity = Math.max(1, Math.min(20, Number(row.quantity) || 1));
      requested.set(String(row.id), (requested.get(String(row.id)) || 0) + quantity);
    }
    if (!requested.size) return fail('Giỏ hàng không có sản phẩm hợp lệ.');
    const lines = [];
    for (const [id, quantity] of requested) {
      const product = await db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
      if (!product || Number(product.stock) < quantity) return fail(`Sản phẩm ${product?.name || 'đã chọn'} không đủ tồn kho.`);
      lines.push({ id: product.id, name: product.name, price: Number(product.price), quantity });
    }

    const safeCustomer = {
      name: String(customerInput.name).slice(0, 100), phone: String(customerInput.phone).slice(0, 30),
      email: String(customerInput.email).slice(0, 140), city: String(customerInput.city).slice(0, 80),
      address: String(customerInput.address).slice(0, 240), note: String(customerInput.note || '').slice(0, 500),
    };
    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const order = {
      id: `CCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, createdAt: new Date().toISOString(),
      customer: safeCustomer, items: lines, total, payment: body.payment,
      status: body.payment === 'cod' ? 'Chờ xử lý' : 'Chờ thanh toán',
    };

    const decremented = [];
    if (body.payment === 'cod') {
      for (const line of lines) {
        const result = await db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').bind(line.quantity, line.id, line.quantity).run();
        if (!result.meta?.changes) {
          for (const previous of decremented) await db.prepare('UPDATE products SET stock=stock+? WHERE id=?').bind(previous.quantity, previous.id).run();
          return fail(`Sản phẩm ${line.name} vừa hết tồn kho. Vui lòng tải lại giỏ hàng.`);
        }
        decremented.push(line);
      }
    }
    try {
      await db.prepare('INSERT INTO orders (id,created_at,payment,status,total,customer_json,items_json) VALUES (?,?,?,?,?,?,?)')
        .bind(order.id, order.createdAt, order.payment, order.status, order.total, JSON.stringify(order.customer), JSON.stringify(order.items)).run();
    } catch (error) {
      for (const previous of decremented) await db.prepare('UPDATE products SET stock=stock+? WHERE id=?').bind(previous.quantity, previous.id).run();
      throw error;
    }

    if (body.payment === 'cod') return json({ orderId: order.id, mode: 'cod' }, 201);
    const now = new Date();
    const params = new URLSearchParams({
      vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Amount: String(total * 100), vnp_CurrCode: 'VND', vnp_TxnRef: order.id,
      vnp_OrderInfo: `Thanh toan don ${order.id}`, vnp_OrderType: 'other', vnp_Locale: 'vn',
      vnp_ReturnUrl: env.VNPAY_RETURN_URL || new URL('/api/payment/vnpay-return', url.origin).toString(),
      vnp_IpAddr: (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '127.0.0.1').split(',')[0].trim(),
      vnp_CreateDate: vnpayDate(now), vnp_ExpireDate: vnpayDate(new Date(now.getTime() + 15 * 60 * 1000)),
    });
    params.set('vnp_SecureHash', await hmac(env.VNPAY_HASH_SECRET, vnpayCanonical(params), 'SHA-512'));
    return json({ orderId: order.id, paymentUrl: `${env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'}?${params.toString()}` }, 201);
  }

  if (method === 'GET' && route === '/api/payment/vnpay-ipn') {
    const params = new URLSearchParams(url.search);
    if (!await verifyVnpay(params, env.VNPAY_HASH_SECRET || '')) return json({ RspCode: '97', Message: 'Invalid signature' });
    const transaction = params.get('vnp_TxnRef');
    const row = await db.prepare('SELECT * FROM orders WHERE id=?').bind(transaction).first();
    if (!row) return json({ RspCode: '01', Message: 'Order not found' });
    const amountOk = Number(params.get('vnp_Amount')) === Number(row.total) * 100;
    if (!amountOk) return json({ RspCode: '04', Message: 'Invalid amount' });
    if (row.status === 'Đã thanh toán') return json({ RspCode: '00', Message: 'Confirm Success' });
    if (params.get('vnp_ResponseCode') === '00' && params.get('vnp_TransactionStatus') === '00') {
      const items = JSON.parse(row.items_json);
      await db.batch([
        ...items.map((item) => db.prepare('UPDATE products SET stock=MAX(0,stock-?) WHERE id=?').bind(item.quantity, item.id)),
        db.prepare('UPDATE orders SET status=? WHERE id=?').bind('Đã thanh toán', transaction),
      ]);
    } else {
      await db.prepare('UPDATE orders SET status=? WHERE id=?').bind('Đã hủy', transaction).run();
    }
    return json({ RspCode: '00', Message: 'Confirm Success' });
  }

  if (method === 'GET' && route === '/api/payment/vnpay-return') {
    const params = new URLSearchParams(url.search);
    const valid = await verifyVnpay(params, env.VNPAY_HASH_SECRET || '');
    const row = await db.prepare('SELECT total FROM orders WHERE id=?').bind(params.get('vnp_TxnRef')).first();
    const ok = valid && row && Number(params.get('vnp_Amount')) === Number(row.total) * 100
      && params.get('vnp_ResponseCode') === '00' && params.get('vnp_TransactionStatus') === '00';
    const result = ok ? 'success' : 'failed';
    return new Response(`<!doctype html><meta charset="utf-8"><title>Kết quả thanh toán</title><script>location.replace('/#payment-result=${result}')</script><p>Đang chuyển về cửa hàng…</p>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return fail('Không tìm thấy API.', 404);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Allow': 'GET,POST,PATCH,OPTIONS' } });
  try {
    const url = new URL(request.url);
    return await handleApi(request, env, url);
  } catch (error) {
    console.error('ComputeCH API error:', error);
    return fail(error.message || 'Máy chủ gặp lỗi. Vui lòng thử lại sau.', 500);
  }
}
