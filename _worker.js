const APP_SCHEMA_VERSION = 1;
const CATALOG_KEY = "system/catalog.json";
const COOKIE_PROD = "__Host-cs_session";
const COOKIE_LOCAL = "cs_session";
const SESSION_ADMIN_SECONDS = 2 * 60 * 60;
const SESSION_TEACHER_SECONDS = 8 * 60 * 60;
const CAPTCHA_SECONDS = 2 * 60;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 8;
const PBKDF2_ITERATIONS = 100_000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CELL_LENGTH = 500;
const MAX_CLASSES = 20;
const MAX_TEACHERS = 100;
const MAX_STUDENTS = 100;
const MAX_PROJECTS = 30;
const MAX_GROUPS = 20;
const MAX_ABS_CELL_SCORE = 1_000_000;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MUTATION_PATTERN = /^[a-zA-Z0-9_-]{12,96}$/;
const RESERVED_OBJECT_KEYS = new Set([
  "__proto__", "prototype", "constructor", "tostring", "valueof", "hasownproperty",
  "isprototypeof", "propertyisenumerable", "tolocalestring", "__definegetter__",
  "__definesetter__", "__lookupgetter__", "__lookupsetter__",
]);
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function apiHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra,
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: apiHeaders(extraHeaders),
  });
}

function okResponse(data, meta = {}, status = 200, headers = {}) {
  return jsonResponse({ ok: true, data, ...meta }, status, headers);
}

function errorResponse(error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof ApiError ? error.message : "服务暂时不可用，请稍后重试。";
  const body = { ok: false, error: { code, message } };
  if (error instanceof ApiError && error.details !== undefined) body.error.details = error.details;
  const retryAfter = Number(error instanceof ApiError ? error.details?.retryAfter : 0);
  return jsonResponse(body, status, Number.isFinite(retryAfter) && retryAfter > 0 ? { "Retry-After": String(Math.ceil(retryAfter)) } : {});
}

function isLocalRequest(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function cookieName(request) {
  return isLocalRequest(request) ? COOKIE_LOCAL : COOKIE_PROD;
}

function sessionCookie(request, token, maxAge) {
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${cookieName(request)}=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearSessionCookies(request) {
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return [
    `${COOKIE_PROD}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    `${COOKIE_LOCAL}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`,
  ];
}

function parseCookies(header) {
  const result = {};
  const duplicates = new Set();
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(result, key)) duplicates.add(key);
    result[key] = value;
  }
  result.__duplicates = duplicates;
  return result;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length) {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError("Invalid random range");
  }
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % maxExclusive;
}

function randomId(prefix = "id") {
  return `${prefix}_${bytesToBase64Url(randomBytes(12))}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIdentifier(value, label = "标识") {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!ID_PATTERN.test(normalized) || RESERVED_OBJECT_KEYS.has(normalized)) {
    throw new ApiError(400, "INVALID_ID", `${label}须为 1–32 位字母、数字、短横线或下划线，且以字母或数字开头。`);
  }
  return normalized;
}

function cleanLabel(value, label, maxLength = 60) {
  const cleaned = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength) {
    throw new ApiError(400, "INVALID_LABEL", `${label}长度须为 1–${maxLength} 个字符。`);
  }
  return cleaned;
}

function validatePassword(password) {
  const value = String(password ?? "");
  const byteLength = encoder.encode(value).byteLength;
  if (value.length < 6 || value.length > 128 || byteLength > 256) {
    throw new ApiError(400, "INVALID_PASSWORD", "密码须为 6–128 个字符。" );
  }
  return value;
}

function assertMutationId(value) {
  if (!MUTATION_PATTERN.test(String(value ?? ""))) {
    throw new ApiError(400, "INVALID_MUTATION_ID", "mutationId 格式无效。" );
  }
  return String(value);
}

function normalizedScoreSource(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[−–—﹣]/g, "-")
    .replace(/[﹢]/g, "+");
}

export function parseScoreText(text) {
  const raw = String(text ?? "");
  if (raw.length > MAX_CELL_LENGTH) {
    return { score: 0, tokens: [], hasUnsignedNumber: false, error: `单元格最多 ${MAX_CELL_LENGTH} 个字符。` };
  }
  const source = normalizedScoreSource(raw);
  const pattern = /[+\-]\s*(?:\d+(?:\.\d{1,2})?|\.\d{1,2})(?![\d.])/g;
  const tokens = [];
  let totalHundredths = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const compact = match[0].replace(/\s+/g, "");
    const value = Number(compact);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_CELL_SCORE) {
      return { score: 0, tokens: [], hasUnsignedNumber: false, error: `单个分值绝对值不能超过 ${MAX_ABS_CELL_SCORE}。` };
    }
    const hundredths = Math.round(value * 100);
    if (!Number.isSafeInteger(hundredths) || !Number.isSafeInteger(totalHundredths + hundredths) || Math.abs(totalHundredths + hundredths) > MAX_ABS_CELL_SCORE * 100) {
      return { score: 0, tokens: [], hasUnsignedNumber: false, error: `单元格合计绝对值不能超过 ${MAX_ABS_CELL_SCORE}。` };
    }
    totalHundredths += hundredths;
    tokens.push({ text: match[0], value: hundredths / 100, index: match.index });
  }
  const withoutSigned = source.replace(pattern, " ");
  const hasUnsignedNumber = /(?:^|[^+\-\d.])\d+(?:\.\d+)?/.test(withoutSigned);
  const score = Number((totalHundredths / 100).toFixed(2));
  return { score, tokens, hasUnsignedNumber, error: null };
}

async function sha256Bytes(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(String(value));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function sha256Base64Url(value) {
  return bytesToBase64Url(await sha256Bytes(value));
}

async function hmacBase64Url(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function constantTimeDigestEqual(left, right) {
  const a = await sha256Bytes(left);
  const b = await sha256Bytes(right);
  if (typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(a, b);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index % a.length] ^ b[index % b.length]);
  return difference === 0;
}

async function derivePasswordHash(password, saltBase64Url, iterations = PBKDF2_ITERATIONS) {
  const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltBase64Url), iterations },
    passwordKey,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

async function createPasswordRecord(password) {
  const checked = validatePassword(password);
  const salt = bytesToBase64Url(randomBytes(16));
  return {
    algorithm: "PBKDF2-HMAC-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt,
    hash: await derivePasswordHash(checked, salt, PBKDF2_ITERATIONS),
  };
}

async function verifyPasswordRecord(password, record) {
  const candidate = String(password ?? "").slice(0, 128);
  const salt = record?.salt || "AAAAAAAAAAAAAAAAAAAAAA";
  const storedIterations = Number(record?.iterations);
  const iterations = Number.isInteger(storedIterations) && storedIterations >= 50_000 && storedIterations <= 600_000
    ? storedIterations
    : PBKDF2_ITERATIONS;
  const expected = record?.hash || "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  let actual;
  try {
    actual = await derivePasswordHash(candidate, salt, iterations);
  } catch {
    actual = await derivePasswordHash(candidate, "AAAAAAAAAAAAAAAAAAAAAA", PBKDF2_ITERATIONS);
  }
  return constantTimeDigestEqual(actual, expected);
}

function defaultCatalog() {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    revision: 0,
    teachers: {},
    classes: {},
    recentMutations: [],
    receipts: {},
    updatedAt: nowIso(),
    lastWriteAtMs: 0,
  };
}

function defaultClass(classId, name) {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    classId,
    name,
    revision: 0,
    structureRevision: 0,
    students: [],
    projects: [],
    groups: [],
    personalScores: {},
    groupScores: {},
    recentMutations: [],
    receipts: {},
    updatedAt: nowIso(),
    lastWriteAtMs: 0,
  };
}

function migrateCatalog(value) {
  if (!value || typeof value !== "object") return defaultCatalog();
  if ((value.schemaVersion || 1) > APP_SCHEMA_VERSION) {
    throw new ApiError(503, "SCHEMA_TOO_NEW", "数据版本高于当前程序支持版本。" );
  }
  return {
    ...defaultCatalog(),
    ...value,
    schemaVersion: APP_SCHEMA_VERSION,
    teachers: value.teachers && typeof value.teachers === "object" ? value.teachers : {},
    classes: value.classes && typeof value.classes === "object" ? value.classes : {},
    recentMutations: Array.isArray(value.recentMutations) ? value.recentMutations.slice(-50) : [],
    receipts: value.receipts && typeof value.receipts === "object" ? value.receipts : {},
  };
}

function migrateClass(value, classId, fallbackName = classId) {
  if (!value || typeof value !== "object") return defaultClass(classId, fallbackName);
  if ((value.schemaVersion || 1) > APP_SCHEMA_VERSION) {
    throw new ApiError(503, "SCHEMA_TOO_NEW", "班级数据版本高于当前程序支持版本。" );
  }
  return {
    ...defaultClass(classId, fallbackName),
    ...value,
    schemaVersion: APP_SCHEMA_VERSION,
    classId,
    students: Array.isArray(value.students) ? value.students : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
    groups: Array.isArray(value.groups) ? value.groups : [],
    personalScores: value.personalScores && typeof value.personalScores === "object" ? value.personalScores : {},
    groupScores: value.groupScores && typeof value.groupScores === "object" ? value.groupScores : {},
    recentMutations: Array.isArray(value.recentMutations) ? value.recentMutations.slice(-50) : [],
    receipts: value.receipts && typeof value.receipts === "object" ? value.receipts : {},
  };
}

async function readJsonObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return {
      data: JSON.parse(await object.text()),
      etag: object.etag,
      httpEtag: object.httpEtag || `"${object.etag}"`,
    };
  } catch {
    throw new ApiError(500, "CORRUPT_DATA", `R2 对象 ${key} 不是有效 JSON。`);
  }
}

async function putJsonObject(bucket, key, data, condition) {
  const options = {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
  };
  if (condition) options.onlyIf = condition;
  return bucket.put(key, JSON.stringify(data), options);
}

function isRetryableR2Error(error) {
  const message = String(error?.message || error);
  return /429|10058|TooManyRequests|503|ServiceUnavailable|10043|10001|InternalError/i.test(message);
}

async function wait(milliseconds) {
  if (milliseconds <= 0) return;
  if (globalThis.scheduler?.wait) {
    await globalThis.scheduler.wait(milliseconds);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function throttleHotObject(lastWriteAtMs) {
  const elapsed = Date.now() - Number(lastWriteAtMs || 0);
  if (elapsed < 1050) await wait(1050 - elapsed + secureRandomInt(120));
}

async function loadCatalog(bucket, createIfMissing = false) {
  let record = await readJsonObject(bucket, CATALOG_KEY);
  if (record) return { ...record, data: migrateCatalog(record.data) };
  if (!createIfMissing) return { data: defaultCatalog(), etag: null, httpEtag: null, missing: true };
  const initial = defaultCatalog();
  const created = await putJsonObject(bucket, CATALOG_KEY, initial, new Headers({ "If-None-Match": "*" }));
  if (!created) {
    record = await readJsonObject(bucket, CATALOG_KEY);
    if (!record) throw new ApiError(503, "CATALOG_INIT_FAILED", "无法初始化系统目录。" );
    return { ...record, data: migrateCatalog(record.data) };
  }
  return { data: initial, etag: created.etag, httpEtag: created.httpEtag || `"${created.etag}"` };
}

function classKey(classId) {
  return `classes/${classId}.json`;
}

async function loadClass(bucket, classId, fallbackName = classId) {
  const record = await readJsonObject(bucket, classKey(classId));
  if (!record) throw new ApiError(404, "CLASS_NOT_FOUND", "班级不存在。" );
  return { ...record, data: migrateClass(record.data, classId, fallbackName) };
}

async function readRequestJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "请求必须使用 application/json。" );
  }
  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader !== null) {
    const normalizedLength = declaredHeader.trim();
    if (!/^\d+$/.test(normalizedLength) || !Number.isSafeInteger(Number(normalizedLength))) {
      throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Content-Length 无效。" );
    }
    if (Number(normalizedLength) > MAX_BODY_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。" );
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* The size rejection is authoritative. */ }
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。" );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "请求 JSON 格式无效。" );
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求 JSON 格式无效。" );
  }
}

function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) throw new ApiError(403, "ORIGIN_REJECTED", "请求来源无效。" );
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError(403, "ORIGIN_REJECTED", "请求来源无效。" );
}

function getClientIp(request) {
  const fallback = isLocalRequest(request) ? "127.0.0.1" : "unknown";
  const value = request.headers.get("cf-connecting-ip") || fallback;
  return /^[0-9A-Fa-f:.]{2,64}$/.test(value) ? value.toLowerCase() : fallback;
}

async function getIpHash(env, request) {
  return hmacBase64Url(env.ADMIN, `cloud-score/ip/${getClientIp(request)}`);
}

function createMathChallenge() {
  const operation = secureRandomInt(3);
  if (operation === 0) {
    const left = 10 + secureRandomInt(40);
    const right = 1 + secureRandomInt(30);
    return { question: `${left} + ${right} = ?`, answer: left + right };
  }
  if (operation === 1) {
    const answer = 1 + secureRandomInt(49);
    const right = 1 + secureRandomInt(30);
    return { question: `${answer + right} - ${right} = ?`, answer };
  }
  const left = 2 + secureRandomInt(8);
  const right = 2 + secureRandomInt(8);
  return { question: `${left} × ${right} = ?`, answer: left * right };
}

async function createCaptcha(env, request) {
  const id = randomId("cap");
  const challenge = createMathChallenge();
  const code = String(challenge.answer);
  const salt = bytesToBase64Url(randomBytes(16));
  const ipHash = await getIpHash(env, request);
  const expiresAt = Date.now() + CAPTCHA_SECONDS * 1000;
  const answerHash = await sha256Base64Url(`${id}:${salt}:${code}`);
  const record = { schemaVersion: 1, salt, answerHash, ipHash, expiresAt, used: false, createdAt: nowIso() };
  const stored = await putJsonObject(env.R2, `captchas/${id}.json`, record, new Headers({ "If-None-Match": "*" }));
  if (!stored) throw new ApiError(503, "CAPTCHA_CREATE_FAILED", "验证码生成失败，请重试。" );
  return { captchaId: id, question: challenge.question, expiresAt };
}

async function consumeCaptcha(env, request, captchaId, captchaCode) {
  const id = String(captchaId ?? "");
  const code = String(captchaCode ?? "").normalize("NFKC").trim();
  if (!/^cap_[A-Za-z0-9_-]{12,}$/.test(id) || !/^\d{1,3}$/.test(code)) return false;
  const key = `captchas/${id}.json`;
  const record = await readJsonObject(env.R2, key);
  if (!record || record.data.used || Number(record.data.expiresAt) < Date.now()) return false;
  const ipHash = await getIpHash(env, request);
  if (!(await constantTimeDigestEqual(ipHash, record.data.ipHash || ""))) return false;
  const actualHash = await sha256Base64Url(`${id}:${record.data.salt}:${code}`);
  const valid = await constantTimeDigestEqual(actualHash, record.data.answerHash || "");
  const createdAtMs = Date.parse(record.data.createdAt || "");
  if (Number.isFinite(createdAtMs)) await wait(Math.max(0, createdAtMs + 1100 - Date.now()));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const consumed = await putJsonObject(env.R2, key, { ...record.data, used: true, usedAt: nowIso() }, { etagMatches: record.etag });
      if (!consumed) return false;
      return valid;
    } catch (error) {
      if (!isRetryableR2Error(error)) throw error;
      if (attempt === 2) throw new ApiError(503, "CAPTCHA_BUSY", "验证码校验繁忙，请刷新后重试。", { retryAfter: 1 });
      await wait(1100 + secureRandomInt(300));
    }
  }
  return false;
}

async function loadGuard(env, ipHash) {
  return readJsonObject(env.R2, `guards/${ipHash}.json`);
}

async function guardStatus(env, ipHash) {
  const record = await loadGuard(env, ipHash);
  const blockedUntil = Number(record?.data?.blockedUntil || 0);
  return { record, blockedUntil, blocked: blockedUntil > Date.now() };
}

async function recordLoginFailure(env, ipHash) {
  const key = `guards/${ipHash}.json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readJsonObject(env.R2, key);
    const now = Date.now();
    const failures = Array.isArray(current?.data?.failures)
      ? current.data.failures.map(Number).filter((value) => value > now - LOGIN_WINDOW_MS)
      : [];
    failures.push(now);
    const blockedUntil = failures.length >= LOGIN_FAILURE_LIMIT ? now + LOGIN_BLOCK_MS : Number(current?.data?.blockedUntil || 0);
    const next = { schemaVersion: 1, failures, blockedUntil, expiresAt: Math.max(blockedUntil, now + LOGIN_WINDOW_MS), updatedAt: nowIso() };
    try {
      const saved = await putJsonObject(
        env.R2,
        key,
        next,
        current ? { etagMatches: current.etag } : new Headers({ "If-None-Match": "*" }),
      );
      if (saved) return { failures: failures.length, blockedUntil };
    } catch (error) {
      if (!isRetryableR2Error(error) || attempt === 2) throw error;
    }
    await wait(1100 + secureRandomInt(240));
  }
  throw new ApiError(429, "LOGIN_BUSY", "登录请求过于频繁，请稍后重试。" );
}

async function clearLoginFailures(env, ipHash) {
  try {
    await env.R2.delete(`guards/${ipHash}.json`);
  } catch {
    // Successful authentication must not fail only because cleanup failed.
  }
}

async function createSession(env, request, role, username, authVersion) {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256Base64Url(token);
  const csrf = bytesToBase64Url(randomBytes(24));
  const maxAge = role === "admin" ? SESSION_ADMIN_SECONDS : SESSION_TEACHER_SECONDS;
  const issuedAt = Date.now();
  const session = {
    schemaVersion: 1,
    role,
    username,
    authVersion,
    adminFingerprint: role === "admin" ? await sha256Base64Url(env.ADMIN) : null,
    csrf,
    issuedAt,
    expiresAt: issuedAt + maxAge * 1000,
  };
  const stored = await putJsonObject(env.R2, `sessions/${tokenHash}.json`, session, new Headers({ "If-None-Match": "*" }));
  if (!stored) throw new ApiError(503, "SESSION_CREATE_FAILED", "无法创建登录会话，请重试。" );
  return { token, session, maxAge, cookie: sessionCookie(request, token, maxAge) };
}

async function authenticate(env, request, requiredRole) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const expectedCookie = cookieName(request);
  if (cookies.__duplicates.has(expectedCookie)) {
    throw new ApiError(401, "SESSION_INVALID", "登录状态无效。" );
  }
  const token = cookies[expectedCookie];
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new ApiError(401, "AUTH_REQUIRED", "请重新登录。" );
  const tokenHash = await sha256Base64Url(token);
  const record = await readJsonObject(env.R2, `sessions/${tokenHash}.json`);
  if (!record || Number(record.data.expiresAt || 0) <= Date.now()) {
    if (record) env.R2.delete(`sessions/${tokenHash}.json`).catch(() => {});
    throw new ApiError(401, "SESSION_EXPIRED", "登录已过期，请重新登录。" );
  }
  const session = record.data;
  let catalogRecord = null;
  if (session.role === "admin") {
    const fingerprint = await sha256Base64Url(env.ADMIN);
    if (!(await constantTimeDigestEqual(fingerprint, session.adminFingerprint || ""))) {
      throw new ApiError(401, "SESSION_REVOKED", "管理员凭据已变更，请重新登录。" );
    }
  } else if (session.role === "teacher") {
    catalogRecord = await loadCatalog(env.R2, false);
    const teacher = catalogRecord.data.teachers[session.username];
    if (!teacher || !teacher.active || Number(teacher.authVersion || 0) !== Number(session.authVersion || 0)) {
      throw new ApiError(401, "SESSION_REVOKED", "账号已停用或凭据已变更，请重新登录。" );
    }
  } else {
    throw new ApiError(401, "SESSION_INVALID", "登录状态无效。" );
  }
  if (requiredRole && session.role !== requiredRole) throw new ApiError(403, "FORBIDDEN", "没有执行此操作的权限。" );
  return { session, tokenHash, catalogRecord };
}

function assertCsrf(request, session) {
  assertSameOrigin(request);
  const token = request.headers.get("x-csrf-token") || "";
  if (!token || token !== session.csrf) throw new ApiError(403, "CSRF_REJECTED", "安全令牌无效，请刷新页面。" );
}

function sanitizeCatalog(catalog) {
  const teachers = Object.values(catalog.teachers).map((teacher) => ({
    username: teacher.username,
    active: Boolean(teacher.active),
    classIds: Array.isArray(teacher.classIds) ? teacher.classIds : [],
    authVersion: Number(teacher.authVersion || 0),
    version: Number(teacher.version || 0),
    createdAt: teacher.createdAt,
    updatedAt: teacher.updatedAt,
  }));
  const classes = Object.values(catalog.classes).map((item) => ({
    id: item.id,
    name: item.name,
    active: Boolean(item.active),
    version: Number(item.version || 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  teachers.sort((a, b) => a.username.localeCompare(b.username));
  classes.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { schemaVersion: catalog.schemaVersion, revision: catalog.revision, teachers, classes, updatedAt: catalog.updatedAt };
}

function classSummaryForSession(catalog, session) {
  if (session.role === "admin") return [];
  const teacher = catalog.teachers[session.username];
  return (teacher?.classIds || [])
    .map((id) => catalog.classes[id])
    .filter((item) => item?.active)
    .map((item) => ({ id: item.id, name: item.name }));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

async function mutationHash(actor, target, body) {
  return sha256Base64Url(stableStringify({ actor, target, baseRevision: body.baseRevision, baseStructureRevision: body.baseStructureRevision, operations: body.operations, changes: body.changes }));
}

function checkReceipt(container, mutationId, payloadHash, actor) {
  const receipt = container.receipts?.[mutationId];
  if (!receipt) return null;
  if (receipt.payloadHash !== payloadHash || receipt.actor !== actor) {
    throw new ApiError(409, "MUTATION_ID_REUSED", "mutationId 已被另一项操作使用。" );
  }
  return receipt;
}

function addReceipt(container, mutationId, payloadHash, actor, revision) {
  const receipts = { ...(container.receipts || {}) };
  receipts[mutationId] = { payloadHash, actor, committedRevision: revision, committedAt: nowIso() };
  const entries = Object.entries(receipts).sort((a, b) => String(a[1].committedAt).localeCompare(String(b[1].committedAt)));
  while (entries.length > 100) {
    const [oldest] = entries.shift();
    delete receipts[oldest];
  }
  container.receipts = receipts;
  container.recentMutations = Object.keys(receipts).slice(-50);
}

function normalizeEtag(value) {
  return String(value || "").trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

function requireIfMatch(request) {
  const value = request.headers.get("if-match");
  if (!value) throw new ApiError(428, "IF_MATCH_REQUIRED", "保存请求缺少 If-Match。" );
  return normalizeEtag(value);
}

function requireBaseRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) throw new ApiError(400, "INVALID_REVISION", "baseRevision 无效。" );
  return revision;
}

function requireOperations(value, max = 100) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    throw new ApiError(400, "INVALID_OPERATIONS", `操作数量须为 1–${max}。`);
  }
  return value;
}

function expectedVersion(entity, supplied, label) {
  const value = Number(supplied);
  if (!Number.isInteger(value) || value < 0 || Number(entity?.version || 0) !== value) {
    throw new ApiError(409, "ENTITY_CONFLICT", `${label}已被其他管理员修改，请刷新后重试。`, {
      currentVersion: Number(entity?.version || 0),
    });
  }
}

function sameActiveLabel(items, name, exceptId) {
  const key = name.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  return items.some((item) => item.active && item.id !== exceptId && item.name.normalize("NFKC").trim().toLocaleLowerCase("zh-CN") === key);
}

function normalizeClassIds(values, catalog) {
  if (!Array.isArray(values)) throw new ApiError(400, "INVALID_CLASS_IDS", "班级绑定必须是数组。" );
  const ids = [...new Set(values.map((value) => normalizeIdentifier(value, "班级号")))];
  for (const id of ids) {
    if (!catalog.classes[id]?.active) throw new ApiError(400, "CLASS_NOT_ACTIVE", `班级 ${id} 不存在或已归档。`);
  }
  return ids;
}

async function ensureClassObject(env, classId, name) {
  const initial = defaultClass(classId, name);
  const written = await putJsonObject(env.R2, classKey(classId), initial, new Headers({ "If-None-Match": "*" }));
  if (written) return;
  const existing = await readJsonObject(env.R2, classKey(classId));
  if (!existing || existing.data.classId !== classId) throw new ApiError(409, "CLASS_STORAGE_CONFLICT", "班级存储已存在且不兼容。" );
}

async function applyCatalogOperations(env, source, operations) {
  const catalog = structuredClone(source);
  for (const operation of operations) {
    const type = String(operation?.type || "");
    if (type === "teacher.create") {
      const username = normalizeIdentifier(operation.username, "教师账号");
      if (username === "admin") throw new ApiError(409, "RESERVED_USERNAME", "admin 是保留账号。" );
      if (catalog.teachers[username]) throw new ApiError(409, "TEACHER_EXISTS", "教师账号已存在，可在归档列表中恢复。" );
      if (Object.values(catalog.teachers).filter((item) => item.active).length >= MAX_TEACHERS) {
        throw new ApiError(409, "TEACHER_LIMIT", `最多支持 ${MAX_TEACHERS} 个有效教师账号。`);
      }
      const classIds = normalizeClassIds(operation.classIds || [], catalog);
      const timestamp = nowIso();
      catalog.teachers[username] = {
        username,
        password: await createPasswordRecord(operation.password),
        active: true,
        classIds,
        authVersion: 1,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      continue;
    }
    if (type.startsWith("teacher.")) {
      const username = normalizeIdentifier(operation.username, "教师账号");
      const teacher = catalog.teachers[username];
      if (!teacher) throw new ApiError(404, "TEACHER_NOT_FOUND", "教师账号不存在。" );
      expectedVersion(teacher, operation.expectedVersion, "教师账号");
      if (type === "teacher.setClasses") teacher.classIds = normalizeClassIds(operation.classIds || [], catalog);
      else if (type === "teacher.resetPassword") teacher.password = await createPasswordRecord(operation.password);
      else if (type === "teacher.archive") teacher.active = false;
      else if (type === "teacher.restore") {
        if (!teacher.active && Object.values(catalog.teachers).filter((entry) => entry.active).length >= MAX_TEACHERS) {
          throw new ApiError(409, "TEACHER_LIMIT", `最多支持 ${MAX_TEACHERS} 个有效教师账号。`);
        }
        teacher.active = true;
      }
      else throw new ApiError(400, "UNKNOWN_OPERATION", `不支持的操作：${type}`);
      teacher.version = Number(teacher.version || 0) + 1;
      teacher.authVersion = Number(teacher.authVersion || 0) + 1;
      teacher.updatedAt = nowIso();
      continue;
    }
    if (type === "class.create") {
      const classId = normalizeIdentifier(operation.classId, "班级号");
      const name = cleanLabel(operation.name || classId, "班级名称", 60);
      if (catalog.classes[classId]) throw new ApiError(409, "CLASS_EXISTS", "班级号已存在，可在归档列表中恢复。" );
      if (Object.values(catalog.classes).filter((item) => item.active).length >= MAX_CLASSES) {
        throw new ApiError(409, "CLASS_LIMIT", `最多支持 ${MAX_CLASSES} 个有效班级。`);
      }
      await ensureClassObject(env, classId, name);
      const timestamp = nowIso();
      catalog.classes[classId] = { id: classId, name, active: true, version: 1, createdAt: timestamp, updatedAt: timestamp };
      continue;
    }
    if (type.startsWith("class.")) {
      const classId = normalizeIdentifier(operation.classId, "班级号");
      const item = catalog.classes[classId];
      if (!item) throw new ApiError(404, "CLASS_NOT_FOUND", "班级不存在。" );
      expectedVersion(item, operation.expectedVersion, "班级");
      if (type === "class.rename") item.name = cleanLabel(operation.name, "班级名称", 60);
      else if (type === "class.archive") item.active = false;
      else if (type === "class.restore") {
        if (!item.active && Object.values(catalog.classes).filter((entry) => entry.active).length >= MAX_CLASSES) {
          throw new ApiError(409, "CLASS_LIMIT", `最多支持 ${MAX_CLASSES} 个有效班级。`);
        }
        item.active = true;
      }
      else throw new ApiError(400, "UNKNOWN_OPERATION", `不支持的操作：${type}`);
      item.version = Number(item.version || 0) + 1;
      item.updatedAt = nowIso();
      continue;
    }
    throw new ApiError(400, "UNKNOWN_OPERATION", `不支持的操作：${type}`);
  }
  return catalog;
}

function publicClassData(value) {
  return {
    schemaVersion: value.schemaVersion,
    classId: value.classId,
    name: value.name,
    revision: value.revision,
    structureRevision: value.structureRevision,
    students: value.students,
    projects: value.projects,
    groups: value.groups,
    personalScores: value.personalScores,
    groupScores: value.groupScores,
    updatedAt: value.updatedAt,
  };
}

function findEntity(items, id, label) {
  const entity = items.find((item) => item.id === id);
  if (!entity) throw new ApiError(404, "ENTITY_NOT_FOUND", `${label}不存在。`);
  return entity;
}

function normalizeEntityId(value, prefix) {
  const id = String(value || "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_-]{12,}$`).test(id)) throw new ApiError(400, "INVALID_ENTITY_ID", "实体 ID 无效。" );
  return id;
}

function reorderActive(items, orderedIds, label) {
  if (!Array.isArray(orderedIds)) throw new ApiError(400, "INVALID_ORDER", `${label}顺序无效。`);
  const activeIds = items.filter((item) => item.active).map((item) => item.id);
  if (orderedIds.length !== activeIds.length || new Set(orderedIds).size !== orderedIds.length || activeIds.some((id) => !orderedIds.includes(id))) {
    throw new ApiError(409, "ORDER_CONFLICT", `${label}列表已改变，请刷新后重试。`);
  }
  orderedIds.forEach((id, index) => {
    const item = items.find((entry) => entry.id === id);
    item.order = index;
    item.version = Number(item.version || 0) + 1;
    item.updatedAt = nowIso();
  });
}

function nextActiveOrder(items) {
  return items.reduce((maximum, item) => item.active ? Math.max(maximum, Number.isFinite(item.order) ? item.order : -1) : maximum, -1) + 1;
}

function assertProjectNameAllowed(name) {
  if (name === "个人总分" || name === "小组总分") {
    throw new ApiError(409, "RESERVED_PROJECT_NAME", "该名称属于系统汇总列，请使用其他项目名称。" );
  }
}

function applyStructureOperations(source, operations) {
  const value = structuredClone(source);
  for (const operation of operations) {
    const type = String(operation?.type || "");
    if (type === "student.create") {
      if (value.students.filter((item) => item.active).length >= MAX_STUDENTS) throw new ApiError(409, "STUDENT_LIMIT", `每班最多 ${MAX_STUDENTS} 名有效学生。`);
      const name = cleanLabel(operation.name, "学生姓名", 50);
      if (sameActiveLabel(value.students, name)) throw new ApiError(409, "DUPLICATE_STUDENT", "有效学生中已存在同名记录。" );
      const groupId = operation.groupId ? normalizeEntityId(operation.groupId, "g") : null;
      if (groupId && !findEntity(value.groups, groupId, "小组").active) throw new ApiError(409, "GROUP_ARCHIVED", "所选小组已归档。" );
      const timestamp = nowIso();
      value.students.push({ id: randomId("s"), name, groupId, active: true, order: nextActiveOrder(value.students), version: 1, createdAt: timestamp, updatedAt: timestamp });
      continue;
    }
    if (type === "project.create") {
      if (value.projects.filter((item) => item.active).length >= MAX_PROJECTS) throw new ApiError(409, "PROJECT_LIMIT", `每班最多 ${MAX_PROJECTS} 个有效评分项目。`);
      const name = cleanLabel(operation.name, "项目名称", 40);
      assertProjectNameAllowed(name);
      if (sameActiveLabel(value.projects, name)) throw new ApiError(409, "DUPLICATE_PROJECT", "项目名称已存在。" );
      const timestamp = nowIso();
      value.projects.push({ id: randomId("p"), name, active: true, order: nextActiveOrder(value.projects), version: 1, createdAt: timestamp, updatedAt: timestamp });
      continue;
    }
    if (type === "group.create") {
      if (value.groups.filter((item) => item.active).length >= MAX_GROUPS) throw new ApiError(409, "GROUP_LIMIT", `每班最多 ${MAX_GROUPS} 个有效小组。`);
      const name = cleanLabel(operation.name, "小组名称", 40);
      if (sameActiveLabel(value.groups, name)) throw new ApiError(409, "DUPLICATE_GROUP", "有效小组中已存在同名记录。" );
      const timestamp = nowIso();
      value.groups.push({ id: randomId("g"), name, active: true, order: nextActiveOrder(value.groups), version: 1, createdAt: timestamp, updatedAt: timestamp });
      continue;
    }
    const match = /^(student|project|group)\.(update|archive|restore|reorder)$/.exec(type);
    if (!match) throw new ApiError(400, "UNKNOWN_OPERATION", `不支持的操作：${type}`);
    const [, kind, action] = match;
    const collection = kind === "student" ? value.students : kind === "project" ? value.projects : value.groups;
    const label = kind === "student" ? "学生" : kind === "project" ? "项目" : "小组";
    if (action === "reorder") {
      reorderActive(collection, operation.orderedIds, label);
      continue;
    }
    const prefix = kind === "student" ? "s" : kind === "project" ? "p" : "g";
    const id = normalizeEntityId(operation.id, prefix);
    const entity = findEntity(collection, id, label);
    expectedVersion(entity, operation.expectedVersion, label);
    if (action === "update") {
      if (operation.name !== undefined) {
        const name = cleanLabel(operation.name, `${label}名称`, kind === "student" ? 50 : 40);
        if (kind === "project") assertProjectNameAllowed(name);
        if (sameActiveLabel(collection, name, id)) throw new ApiError(409, "DUPLICATE_NAME", `有效${label}中已存在同名记录。`);
        entity.name = name;
      }
      if (kind === "student" && operation.groupId !== undefined) {
        const groupId = operation.groupId ? normalizeEntityId(operation.groupId, "g") : null;
        if (groupId && !findEntity(value.groups, groupId, "小组").active) throw new ApiError(409, "GROUP_ARCHIVED", "所选小组已归档。" );
        entity.groupId = groupId;
      }
    } else if (action === "archive") {
      entity.active = false;
      if (kind === "group") {
        for (const student of value.students) {
          if (student.groupId !== entity.id) continue;
          student.groupId = null;
          student.version = Number(student.version || 0) + 1;
          student.updatedAt = nowIso();
        }
      }
    }
    else if (action === "restore") {
      if (kind === "project") assertProjectNameAllowed(entity.name);
      if (sameActiveLabel(collection, entity.name, id)) throw new ApiError(409, "DUPLICATE_NAME", `恢复前请先处理同名${label}。`);
      const limit = kind === "student" ? MAX_STUDENTS : kind === "project" ? MAX_PROJECTS : MAX_GROUPS;
      if (!entity.active && collection.filter((item) => item.active).length >= limit) {
        throw new ApiError(409, `${kind.toUpperCase()}_LIMIT`, `${label}有效数量已达到上限 ${limit}。`);
      }
      if (kind === "student" && entity.groupId && !value.groups.find((group) => group.id === entity.groupId && group.active)) entity.groupId = null;
      if (!entity.active) entity.order = nextActiveOrder(collection);
      entity.active = true;
    }
    entity.version = Number(entity.version || 0) + 1;
    entity.updatedAt = nowIso();
  }
  return value;
}

function getCell(container, subjectId, projectId) {
  return container?.[subjectId]?.[projectId] || { raw: "", score: 0, revision: 0, parserVersion: 1 };
}

function setCell(container, subjectId, projectId, cell) {
  if (!container[subjectId]) container[subjectId] = {};
  container[subjectId][projectId] = cell;
}

function applyScoreChanges(source, changes, actor) {
  const value = structuredClone(source);
  const conflicts = [];
  const targets = new Set();
  const prepared = [];
  for (const change of changes) {
    const scope = change?.scope === "group" ? "group" : change?.scope === "student" ? "student" : null;
    if (!scope) throw new ApiError(400, "INVALID_SCOPE", "积分范围无效。" );
    const subjectId = normalizeEntityId(change.subjectId, scope === "student" ? "s" : "g");
    const projectId = normalizeEntityId(change.projectId, "p");
    const targetKey = `${scope}:${subjectId}:${projectId}`;
    if (targets.has(targetKey)) throw new ApiError(400, "DUPLICATE_TARGET", "同一批次不能重复修改同一单元格。" );
    targets.add(targetKey);
    const subject = findEntity(scope === "student" ? value.students : value.groups, subjectId, scope === "student" ? "学生" : "小组");
    const project = findEntity(value.projects, projectId, "项目");
    if (!subject.active || !project.active) throw new ApiError(409, "ENTITY_ARCHIVED", "学生、小组或项目已归档，请刷新后重试。" );
    const raw = String(change.text ?? "");
    const parsed = parseScoreText(raw);
    if (parsed.error) throw new ApiError(400, "INVALID_SCORE_TEXT", parsed.error);
    const expected = Number(change.baseCellRevision);
    if (!Number.isInteger(expected) || expected < 0) throw new ApiError(400, "INVALID_CELL_REVISION", "单元格版本无效。" );
    const container = scope === "student" ? value.personalScores : value.groupScores;
    const current = getCell(container, subjectId, projectId);
    if (Number(current.revision || 0) !== expected && current.raw !== raw) {
      conflicts.push({ scope, subjectId, projectId, localText: raw, current });
    }
    prepared.push({ scope, subjectId, projectId, raw, parsed, current });
  }
  if (conflicts.length) throw new ApiError(409, "CELL_CONFLICT", "部分单元格已被其他教师修改。", { conflicts, currentRevision: value.revision });
  const nextRevision = Number(value.revision || 0) + 1;
  for (const item of prepared) {
    const container = item.scope === "student" ? value.personalScores : value.groupScores;
    setCell(container, item.subjectId, item.projectId, {
      raw: item.raw,
      score: item.parsed.score,
      hasUnsignedNumber: item.parsed.hasUnsignedNumber,
      parserVersion: 1,
      revision: Number(item.current.revision || 0) + 1,
      updatedBy: actor,
      updatedAt: nowIso(),
    });
  }
  value.revision = nextRevision;
  value.updatedAt = nowIso();
  return value;
}

async function assertClassAccess(env, auth, classId, role = "any") {
  const catalogRecord = auth.catalogRecord || await loadCatalog(env.R2, false);
  const item = catalogRecord.data.classes[classId];
  if (!item || !item.active) throw new ApiError(404, "CLASS_NOT_FOUND", "班级不存在或已归档。" );
  if (role === "admin" && auth.session.role !== "admin") throw new ApiError(403, "FORBIDDEN", "仅管理员可执行此操作。" );
  if (role === "teacher" && auth.session.role !== "teacher") throw new ApiError(403, "FORBIDDEN", "仅教师可编辑积分。" );
  if (auth.session.role === "teacher") {
    const teacher = catalogRecord.data.teachers[auth.session.username];
    if (!teacher?.active || !(teacher.classIds || []).includes(classId)) throw new ApiError(403, "CLASS_FORBIDDEN", "该账号未绑定此班级。" );
  }
  return { catalogRecord, classMeta: item };
}

async function handleCaptcha(context) {
  return okResponse(await createCaptcha(context.env, context.request));
}

async function handleLogin(context) {
  const { request, env } = context;
  const startedAt = Date.now();
  const targetDelay = 500 + secureRandomInt(501);
  let response;
  try {
    assertSameOrigin(request);
    const body = await readRequestJson(request);
    const ipHash = await getIpHash(env, request);
    const status = await guardStatus(env, ipHash);
    if (status.blocked) {
      const retryAfter = Math.max(1, Math.ceil((status.blockedUntil - Date.now()) / 1000));
      response = jsonResponse({ ok: false, error: { code: "IP_BLOCKED", message: "错误次数过多，请稍后再试。", details: { retryAfter } } }, 429, { "Retry-After": String(retryAfter) });
    } else {
      const captchaValid = await consumeCaptcha(env, request, body.captchaId, body.captchaCode);
      if (!captchaValid) {
        const failure = await recordLoginFailure(env, ipHash);
        response = jsonResponse({ ok: false, error: { code: "INVALID_CAPTCHA", message: "验证码错误或已过期，请重新获取。", details: { blockedUntil: failure.blockedUntil || 0 } } }, 400);
      } else {
        let username = "";
        try { username = normalizeIdentifier(body.username, "账号"); } catch { username = "invalid"; }
        const password = String(body.password ?? "").slice(0, 128);
        let valid = false;
        let role = "teacher";
        let authVersion = 0;
        if (username === "admin") {
          role = "admin";
          valid = await constantTimeDigestEqual(password, env.ADMIN);
        } else {
          const catalogRecord = await loadCatalog(env.R2, false);
          const teacher = catalogRecord.data.teachers[username];
          valid = await verifyPasswordRecord(password, teacher?.password);
          valid = Boolean(valid && teacher?.active);
          authVersion = Number(teacher?.authVersion || 0);
        }
        if (!valid) {
          const failure = await recordLoginFailure(env, ipHash);
          response = jsonResponse({ ok: false, error: { code: "INVALID_CREDENTIALS", message: "账号、密码或验证码不正确。", details: { blockedUntil: failure.blockedUntil || 0 } } }, 401);
        } else {
          if (role === "admin") await loadCatalog(env.R2, true);
          const session = await createSession(env, request, role, username, authVersion);
          response = okResponse({ role, username, redirect: role === "admin" ? "/admin.html" : "/teacher.html" }, {}, 200, { "Set-Cookie": session.cookie });
        }
      }
    }
  } catch (error) {
    response = errorResponse(error);
  }
  await wait(Math.max(0, targetDelay - (Date.now() - startedAt)));
  return response;
}

async function handleSession(context) {
  const auth = await authenticate(context.env, context.request);
  const catalogRecord = auth.catalogRecord || (auth.session.role === "teacher" ? await loadCatalog(context.env.R2, false) : null);
  const classes = catalogRecord ? classSummaryForSession(catalogRecord.data, auth.session) : [];
  return okResponse({
    role: auth.session.role,
    username: auth.session.username,
    csrf: auth.session.csrf,
    expiresAt: auth.session.expiresAt,
    classes,
  });
}

async function handleLogout(context) {
  assertSameOrigin(context.request);
  let auth = null;
  try { auth = await authenticate(context.env, context.request); } catch { /* Clear stale cookie below. */ }
  if (auth) {
    assertCsrf(context.request, auth.session);
    await context.env.R2.delete(`sessions/${auth.tokenHash}.json`);
  }
  const response = okResponse({ loggedOut: true });
  for (const cookie of clearSessionCookies(context.request)) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function handleAdminCatalogGet(context) {
  await authenticate(context.env, context.request, "admin");
  const record = await loadCatalog(context.env.R2, true);
  return okResponse({ catalog: sanitizeCatalog(record.data) }, { revision: record.data.revision, etag: record.httpEtag }, 200, { ETag: record.httpEtag });
}

async function handleAdminCatalogPatch(context) {
  const auth = await authenticate(context.env, context.request, "admin");
  assertCsrf(context.request, auth.session);
  const clientEtag = requireIfMatch(context.request);
  const body = await readRequestJson(context.request);
  const mutationId = assertMutationId(body.mutationId);
  const baseRevision = requireBaseRevision(body.baseRevision);
  const operations = requireOperations(body.operations, 20);
  const payloadHash = await mutationHash(auth.session.username, "catalog", body);
  const current = await loadCatalog(context.env.R2, true);
  const receipt = checkReceipt(current.data, mutationId, payloadHash, auth.session.username);
  if (receipt) return okResponse({ catalog: sanitizeCatalog(current.data), replayed: true }, { revision: current.data.revision, etag: current.httpEtag }, 200, { ETag: current.httpEtag });
  if (baseRevision !== current.data.revision || clientEtag !== current.etag) {
    throw new ApiError(409, "CATALOG_CONFLICT", "管理数据已更新，请刷新后重试。", { catalog: sanitizeCatalog(current.data), revision: current.data.revision, etag: current.httpEtag });
  }
  const next = await applyCatalogOperations(context.env, current.data, operations);
  next.revision = Number(current.data.revision || 0) + 1;
  next.updatedAt = nowIso();
  addReceipt(next, mutationId, payloadHash, auth.session.username, next.revision);
  await throttleHotObject(current.data.lastWriteAtMs);
  next.lastWriteAtMs = Date.now();
  let written = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      written = await putJsonObject(context.env.R2, CATALOG_KEY, next, { etagMatches: current.etag });
      break;
    } catch (error) {
      if (!isRetryableR2Error(error) || attempt === 2) throw new ApiError(503, "R2_WRITE_FAILED", "保存繁忙，请稍后重试。" );
      await wait(1100 + secureRandomInt(300));
    }
  }
  if (!written) throw new ApiError(409, "CATALOG_CONFLICT", "管理数据已被其他操作更新，请刷新后重试。" );
  return okResponse({ catalog: sanitizeCatalog(next), replayed: false }, { revision: next.revision, etag: written.httpEtag }, 200, { ETag: written.httpEtag || `"${written.etag}"` });
}

async function handleClassGet(context, classId) {
  const auth = await authenticate(context.env, context.request);
  const access = await assertClassAccess(context.env, auth, classId, "any");
  const record = await loadClass(context.env.R2, classId, access.classMeta.name);
  const value = { ...record.data, name: access.classMeta.name };
  return okResponse({ class: publicClassData(value) }, { revision: value.revision, etag: record.httpEtag }, 200, { ETag: record.httpEtag });
}

async function handleClassStructurePatch(context, classId) {
  const auth = await authenticate(context.env, context.request);
  assertCsrf(context.request, auth.session);
  const access = await assertClassAccess(context.env, auth, classId, "any");
  const clientEtag = requireIfMatch(context.request);
  const body = await readRequestJson(context.request);
  const mutationId = assertMutationId(body.mutationId);
  const baseRevision = requireBaseRevision(body.baseRevision);
  const operations = requireOperations(body.operations, 100);
  const payloadHash = await mutationHash(auth.session.username, `class:${classId}:structure`, body);
  const current = await loadClass(context.env.R2, classId, access.classMeta.name);
  const receipt = checkReceipt(current.data, mutationId, payloadHash, auth.session.username);
  if (receipt) return okResponse({ class: publicClassData({ ...current.data, name: access.classMeta.name }), replayed: true }, { revision: current.data.revision, etag: current.httpEtag }, 200, { ETag: current.httpEtag });
  if (baseRevision !== current.data.revision || clientEtag !== current.etag) {
    throw new ApiError(409, "CLASS_CONFLICT", "班级结构已更新，请刷新后重试。", {
      class: publicClassData({ ...current.data, name: access.classMeta.name }),
      revision: current.data.revision,
      etag: current.httpEtag,
    });
  }
  const next = applyStructureOperations(current.data, operations);
  next.name = access.classMeta.name;
  next.revision = Number(current.data.revision || 0) + 1;
  next.structureRevision = Number(current.data.structureRevision || 0) + 1;
  next.updatedAt = nowIso();
  addReceipt(next, mutationId, payloadHash, auth.session.username, next.revision);
  await throttleHotObject(current.data.lastWriteAtMs);
  if (auth.session.role === "teacher") {
    await verifyFreshTeacherAccess(context.env, auth.session, classId);
  }
  next.lastWriteAtMs = Date.now();
  let written = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      written = await putJsonObject(context.env.R2, classKey(classId), next, { etagMatches: current.etag });
      break;
    } catch (error) {
      if (!isRetryableR2Error(error) || attempt === 2) {
        throw new ApiError(503, "R2_WRITE_FAILED", "保存繁忙，请稍后重试。" );
      }
      await wait(1100 + secureRandomInt(300));
    }
  }
  if (!written) throw new ApiError(409, "CLASS_CONFLICT", "班级已被其他操作更新，请刷新后重试。" );
  return okResponse({ class: publicClassData(next), replayed: false }, { revision: next.revision, etag: written.httpEtag }, 200, { ETag: written.httpEtag || `"${written.etag}"` });
}

async function handlePasswordChange(context) {
  assertSameOrigin(context.request);
  const auth = await authenticate(context.env, context.request, "teacher");
  assertCsrf(context.request, auth.session);
  const body = await readRequestJson(context.request);
  const currentPassword = String(body.currentPassword ?? "").slice(0, 128);
  const newPassword = validatePassword(body.newPassword);
  if (!currentPassword) {
    throw new ApiError(400, "INVALID_CURRENT_PASSWORD", "请输入当前密码。");
  }
  const catalogRecord = await loadCatalog(context.env.R2, false);
  const teacher = catalogRecord.data.teachers[auth.session.username];
  if (!teacher || !teacher.active) {
    throw new ApiError(401, "SESSION_REVOKED", "账号已停用，请联系管理员。");
  }
  const valid = await verifyPasswordRecord(currentPassword, teacher.password);
  if (!valid) {
    throw new ApiError(400, "INVALID_CREDENTIALS", "当前密码不正确。");
  }
  const newPasswordRecord = await createPasswordRecord(newPassword);
  const nextAuthVersion = Number(teacher.authVersion || 0) + 1;
  const nextTeacherVersion = Number(teacher.version || 0) + 1;
  const nextCatalog = {
    ...catalogRecord.data,
    teachers: {
      ...catalogRecord.data.teachers,
      [auth.session.username]: {
        ...teacher,
        password: newPasswordRecord,
        authVersion: nextAuthVersion,
        version: nextTeacherVersion,
        updatedAt: nowIso(),
      },
    },
    revision: Number(catalogRecord.data.revision || 0) + 1,
    updatedAt: nowIso(),
  };
  await throttleHotObject(catalogRecord.data.lastWriteAtMs);
  nextCatalog.lastWriteAtMs = Date.now();
  let written = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      written = await putJsonObject(context.env.R2, CATALOG_KEY, nextCatalog, { etagMatches: catalogRecord.etag });
      break;
    } catch (error) {
      if (!isRetryableR2Error(error) || attempt === 2) {
        throw new ApiError(503, "R2_WRITE_FAILED", "修改密码繁忙，请稍后重试。");
      }
      await wait(1100 + secureRandomInt(300));
    }
  }
  if (!written) throw new ApiError(409, "CATALOG_CONFLICT", "账号信息已被其他操作更新，请刷新后重试。");
  const newSession = await createSession(context.env, context.request, "teacher", auth.session.username, nextAuthVersion);
  try {
    await context.env.R2.delete(`sessions/${auth.tokenHash}.json`);
  } catch {
    // Non-critical cleanup
  }
  return okResponse({ message: "密码已成功修改。" }, {}, 200, { "Set-Cookie": newSession.cookie });
}

async function verifyFreshTeacherAccess(env, session, classId) {
  const fresh = await loadCatalog(env.R2, false);
  const teacher = fresh.data.teachers[session.username];
  if (!teacher?.active || Number(teacher.authVersion || 0) !== Number(session.authVersion || 0)) {
    throw new ApiError(401, "SESSION_REVOKED", "账号权限已变更，请重新登录。" );
  }
  if (!fresh.data.classes[classId]?.active || !(teacher.classIds || []).includes(classId)) {
    throw new ApiError(403, "CLASS_FORBIDDEN", "该账号已不再绑定此班级。" );
  }
}

async function handleClassScoresPatch(context, classId) {
  const auth = await authenticate(context.env, context.request, "teacher");
  assertCsrf(context.request, auth.session);
  const access = await assertClassAccess(context.env, auth, classId, "teacher");
  const clientEtag = requireIfMatch(context.request);
  const body = await readRequestJson(context.request);
  const mutationId = assertMutationId(body.mutationId);
  const baseRevision = requireBaseRevision(body.baseRevision);
  const baseStructureRevision = requireBaseRevision(body.baseStructureRevision);
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length < 1 || changes.length > 500) throw new ApiError(400, "INVALID_CHANGES", "积分修改数量须为 1–500。" );
  const payloadHash = await mutationHash(auth.session.username, `class:${classId}:scores`, body);
  let merged = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await loadClass(context.env.R2, classId, access.classMeta.name);
    const receipt = checkReceipt(current.data, mutationId, payloadHash, auth.session.username);
    if (receipt) return okResponse({ class: publicClassData({ ...current.data, name: access.classMeta.name }), replayed: true, merged }, { revision: current.data.revision, etag: current.httpEtag }, 200, { ETag: current.httpEtag });
    if (baseStructureRevision !== Number(current.data.structureRevision || 0)) {
      throw new ApiError(409, "STRUCTURE_CONFLICT", "班级结构已变化，请核对本地草稿后重试。", {
        class: publicClassData({ ...current.data, name: access.classMeta.name }),
        revision: current.data.revision,
        etag: current.httpEtag,
      });
    }
    if (baseRevision > current.data.revision) throw new ApiError(409, "REVISION_AHEAD", "本地版本无效，请重新加载班级。" );
    merged ||= baseRevision !== current.data.revision || clientEtag !== current.etag;
    let next;
    try {
      next = applyScoreChanges(current.data, changes, auth.session.username);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CELL_CONFLICT") {
        error.details = {
          ...error.details,
          class: publicClassData({ ...current.data, name: access.classMeta.name }),
          revision: current.data.revision,
          etag: current.httpEtag,
        };
      }
      throw error;
    }
    next.name = access.classMeta.name;
    addReceipt(next, mutationId, payloadHash, auth.session.username, next.revision);
    await throttleHotObject(current.data.lastWriteAtMs);
    await verifyFreshTeacherAccess(context.env, auth.session, classId);
    next.lastWriteAtMs = Date.now();
    try {
      const written = await putJsonObject(context.env.R2, classKey(classId), next, { etagMatches: current.etag });
      if (written) {
        return okResponse({ class: publicClassData(next), replayed: false, merged }, { revision: next.revision, etag: written.httpEtag }, 200, { ETag: written.httpEtag || `"${written.etag}"` });
      }
    } catch (error) {
      if (!isRetryableR2Error(error)) throw new ApiError(503, "R2_WRITE_FAILED", "保存失败，请稍后重试。" );
    }
    if (attempt < 2) await wait(1100 + secureRandomInt(300));
  }
  throw new ApiError(503, "WRITE_CONTENTION", "多人同时保存较频繁，请稍后重试。", { retryAfter: 1 });
}

function methodNotAllowed(allowed) {
  return jsonResponse({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "请求方法不受支持。" } }, 405, { Allow: allowed.join(", ") });
}

function isProductionPagesDev(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "pages.dev" || normalized.endsWith(".pages.dev");
}

export async function onRequest(context) {
  try {
    if (!context.env?.R2 || typeof context.env.ADMIN !== "string" || !context.env.ADMIN) {
      throw new ApiError(503, "CONFIGURATION_ERROR", "服务尚未完成 R2 或 ADMIN 配置。" );
    }
    const request = context.request;
    const url = new URL(request.url);
    if (!isLocalRequest(request) && isProductionPagesDev(url.hostname)) {
      throw new ApiError(421, "CUSTOM_DOMAIN_REQUIRED", "生产 API 仅允许通过已绑定的自定义域名访问。" );
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    if (path === "/api/auth/captcha") return method === "GET" ? await handleCaptcha(context) : methodNotAllowed(["GET"]);
    if (path === "/api/auth/login") return method === "POST" ? await handleLogin(context) : methodNotAllowed(["POST"]);
    if (path === "/api/auth/session") return method === "GET" ? await handleSession(context) : methodNotAllowed(["GET"]);
    if (path === "/api/auth/logout") return method === "POST" ? await handleLogout(context) : methodNotAllowed(["POST"]);
    if (path === "/api/auth/password") return method === "POST" ? await handlePasswordChange(context) : methodNotAllowed(["POST"]);
    if (path === "/api/admin/catalog") {
      if (method === "GET") return await handleAdminCatalogGet(context);
      if (method === "PATCH") return await handleAdminCatalogPatch(context);
      return methodNotAllowed(["GET", "PATCH"]);
    }
    const classRoute = /^\/api\/classes\/([a-zA-Z0-9_-]+)(?:\/(structure|scores))?$/.exec(path);
    if (classRoute) {
      const classId = normalizeIdentifier(classRoute[1], "班级号");
      if (!classRoute[2]) return method === "GET" ? await handleClassGet(context, classId) : methodNotAllowed(["GET"]);
      if (classRoute[2] === "structure") return method === "PATCH" ? await handleClassStructurePatch(context, classId) : methodNotAllowed(["PATCH"]);
      if (classRoute[2] === "scores") return method === "PATCH" ? await handleClassScoresPatch(context, classId) : methodNotAllowed(["PATCH"]);
    }
    throw new ApiError(404, "NOT_FOUND", "API 路径不存在。" );
  } catch (error) {
    return errorResponse(error);
  }
}

export const __test = Object.freeze({
  parseScoreText,
  normalizeIdentifier,
  migrateCatalog,
  migrateClass,
  applyStructureOperations,
  applyScoreChanges,
  createMathChallenge,
  defaultCatalog,
  defaultClass,
});

// Flat Cloudflare Pages Advanced Mode adapter. Generated by scripts/build-release.mjs.
const advancedModeWorker = {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(new RegExp("/+$"), "") || "/";

    // 1. Root redirect
    if ((request.method === "GET" || request.method === "HEAD") && (pathname === "/" || pathname === "/index.html" || pathname === "/index")) {
      return Response.redirect(new URL("/login.html", url), 302);
    }

    // 2. API routing
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return onRequest({
        request,
        env,
        params: {},
        data: {},
        functionPath: "/api/[[path]]",
        waitUntil: (promise) => executionContext.waitUntil(promise),
        passThroughOnException: () => {},
        next: () => env.ASSETS.fetch(request),
      });
    }

    // 3. Permitted pages whitelist (both pretty URLs and .html paths)
    const allowedPages = new Set([
      "/login", "/login.html",
      "/admin", "/admin.html",
      "/teacher", "/teacher.html",
    ]);

    if (!allowedPages.has(pathname)) {
      // Strictly redirect any unauthorized or unknown non-API path to /login.html
      return Response.redirect(new URL("/login.html", url), 302);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset binding is unavailable.", { status: 503 });
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404) {
      return Response.redirect(new URL("/login.html", url), 302);
    }
    const headers = new Headers(asset.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};

export default advancedModeWorker;
