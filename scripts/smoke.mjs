/**
 * verify 服务的 HTTP 冒烟检查：
 * 等待 Web 服务就绪后，校验健康检查端点与首页内容。
 * 通过环境变量 WEB_URL 指定目标（Compose 内默认为 http://web:80）。
 */
const base = (process.env.WEB_URL || 'http://web:80').replace(/\/$/, '');
const TIMEOUT_MS = 60_000;
const INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(path) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + path);
      if (res.ok) return await res.text();
      lastError = new Error(`GET ${path} -> HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(INTERVAL_MS);
  }
  throw lastError ?? new Error(`GET ${path} 超时`);
}

const health = await fetchWithRetry('/health');
if (!health.includes('ok')) {
  throw new Error(`/health 响应异常：${JSON.stringify(health)}`);
}
console.log(`✓ ${base}/health 返回正常`);

const html = await fetchWithRetry('/');
if (!html.includes('id="root"') || !html.includes('铺层')) {
  throw new Error('首页缺少挂载点或页面标题标记');
}
console.log(`✓ ${base}/ 首页包含挂载点与标题`);

console.log('冒烟检查通过：Web 服务可访问且内容正确。');
