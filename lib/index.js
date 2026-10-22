import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * dsh-web-search-switch —— DSH 网页搜索多端点管理插件（宿主半侧，v2）。
 *
 * - 注册搜索 provider（id 仍为 `deepseek-official`），每次搜索读取
 *   `~/.dsh/web-search-switch.json` 中 defaultId 指向的条目；
 * - 条目支持两种协议：
 *   - `anthropic-messages`：Anthropic Messages + 服务端 web_search（官方 Messages、自定义端点）；
 *   - `deepseek-search`：DeepSeek 官方 Search API（POST /v1/tools/search，Bearer 或账号 token）；
 * - 鉴权模式：`account`（仅账号 token）、`api-key`（仅 API Key）、`auto`（账号优先，回退 Key）；
 * - 计费头仅 Messages 协议使用，非空时才发送 `system` 字段；
 * - 设置页通过同源 HTTP 路由读写配置与凭据。
 *
 * 该文件是标准插件的宿主入口：零运行时依赖，只使用 node 内置模块。
 *
 * @module dsh-web-search-switch
 */

/** Cordis plugin name (loader diagnostics). */
const name = "web-search-switch";
/** Services this plugin requires. */
const inject = ["web", "webServer"];

/** Provider id registered on the web seam; `web.searchProvider` keeps pointing here. */
const PROVIDER_ID = "deepseek-official";
/** Same-origin routes the settings page talks to. */
const ROUTE_PREFIX = "/api/dsh/web-search-switch";
/** Config document under `$DSH_HOME`. */
const CONFIG_FILENAME = "web-search-switch.json";
const CONFIG_VERSION = 2;
/** Attribution header. */
const USER_AGENT = "dsh-web-search-switch/0.2.0";
/** Anthropic Messages protocol version header. */
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_USES = 5;
const DEFAULT_SEARCH_COUNT = 10;
const MAX_SEARCH_COUNT = 50;
const MAX_ENTRIES = 20;
const MAX_BODY_BYTES = 256 * 1024;
/** Built-in official entries; both are undeletable and have read-only endpoints. */
const OFFICIAL_MESSAGES_ID = "official-messages";
const OFFICIAL_SEARCH_ID = "official-search";
const BUILTIN_IDS = [OFFICIAL_MESSAGES_ID, OFFICIAL_SEARCH_ID];
/** Canonical official endpoints (read-only in the UI). */
const OFFICIAL_MESSAGES_BASE = "https://api.deepseek.com/anthropic/v1";
const OFFICIAL_SEARCH_BASE = "https://api.deepseek.com/v1/tools";
const PROTOCOLS = new Set(["anthropic-messages", "deepseek-search"]);
const AUTH_MODES = new Set(["account", "api-key", "auto"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** Typed failure carrying a machine-routable `code`, mirroring the web seam vocabulary. */
class SearchError extends Error {
	constructor(message, code = "WEB_PROVIDER_ERROR", options) {
		super(message, options);
		this.name = "SearchError";
		this.code = code;
	}
}

//#region config document

/** DSH home (honours `DSH_HOME`, defaults to `~/.dsh`). */
function dshHome() {
	const configured = process.env.DSH_HOME?.trim();
	return configured !== undefined && configured !== "" ? configured : path.join(os.homedir(), ".dsh");
}

function configFile() {
	return path.join(dshHome(), CONFIG_FILENAME);
}

function optionalPositiveInt(value, fallback, label, max) {
	if (value === undefined || value === null || value === "") return fallback;
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须是正整数`);
	if (max !== undefined && value > max) throw new Error(`${label} 不能大于 ${max}`);
	return value;
}

/** Default shape of one built-in official entry. */
function builtinDefault(id) {
	if (id === OFFICIAL_MESSAGES_ID) {
		return {
			id,
			label: "官方搜索（账号）",
			builtin: "official",
			protocol: "anthropic-messages",
			auth: "account",
			baseURL: OFFICIAL_MESSAGES_BASE,
			model: "deepseek-flash",
			modelProvider: "deepseek-account",
			apiKeyEnv: "DEEPSEEK_API_KEY",
			billingHeader: "",
			maxTokens: DEFAULT_MAX_TOKENS,
			maxUses: DEFAULT_MAX_USES
		};
	}
	if (id === OFFICIAL_SEARCH_ID) {
		return {
			id,
			label: "官方搜索（API）",
			builtin: "official",
			protocol: "deepseek-search",
			auth: "api-key",
			baseURL: OFFICIAL_SEARCH_BASE,
			apiKeyEnv: "DEEPSEEK_API_KEY",
			count: DEFAULT_SEARCH_COUNT
		};
	}
	return undefined;
}

function isBuiltinId(id) {
	return BUILTIN_IDS.includes(id);
}

/** Validate and normalize one entry read from disk or received from the page. */
function normalizeEntry(raw, index) {
	const id = typeof raw?.id === "string" ? raw.id.trim() : "";
	if (!ID_PATTERN.test(id)) throw new Error(`第 ${index + 1} 个条目的 id 不合法（小写字母/数字/-/_，最长 32 位）`);
	const builtin = isBuiltinId(id);
	const defaults = builtinDefault(id) ?? {};
	const label = typeof raw?.label === "string" ? raw.label.trim() : (defaults.label ?? "");
	if (label.length === 0 || label.length > 40) throw new Error(`条目「${id}」的名称需为 1-40 个字符`);
	const protocol = builtin ? defaults.protocol : (typeof raw?.protocol === "string" ? raw.protocol : "anthropic-messages");
	if (!PROTOCOLS.has(protocol)) throw new Error(`条目「${label}」的协议不合法`);
	const auth = typeof raw?.auth === "string" ? raw.auth : (defaults.auth ?? "api-key");
	if (!AUTH_MODES.has(auth)) throw new Error(`条目「${label}」的鉴权方式不合法`);
	const requestedBase = typeof raw?.baseURL === "string" && raw.baseURL.trim().length > 0 ? raw.baseURL : defaults.baseURL;
	const baseURL = normalizeBaseURL(requestedBase, label);
	if (builtin && baseURL !== defaults.baseURL) throw new Error(`内置条目「${label}」的 baseURL 不可修改`);
	const apiKeyEnv = typeof raw?.apiKeyEnv === "string" && raw.apiKeyEnv.trim().length > 0 ? raw.apiKeyEnv.trim() : (defaults.apiKeyEnv ?? "DEEPSEEK_API_KEY");
	if (!REF_PATTERN.test(apiKeyEnv)) throw new Error(`条目「${label}」的凭据引用名不合法（字母/数字/下划线，字母或下划线开头）`);
	const entry = { id, label, protocol, auth, baseURL, apiKeyEnv };
	if (builtin) entry.builtin = "official";
	if (protocol === "anthropic-messages") {
		const model = typeof raw?.model === "string" && raw.model.trim().length > 0 ? raw.model.trim() : (defaults.model ?? "");
		if (model.length === 0 || model.length > 120) throw new Error(`条目「${label}」的模型名需为 1-120 个字符`);
		const billingHeader = typeof raw?.billingHeader === "string" ? raw.billingHeader : (defaults.billingHeader ?? "");
		if (/[\r\n]/u.test(billingHeader)) throw new Error(`条目「${label}」的计费头不能包含换行`);
		if (billingHeader.length > 300) throw new Error(`条目「${label}」的计费头过长（最多 300 字符）`);
		entry.model = model;
		entry.billingHeader = billingHeader;
		const modelProvider = typeof raw?.modelProvider === "string" ? raw.modelProvider.trim() : (defaults.modelProvider ?? "");
		if (modelProvider.length > 80) throw new Error(`条目「${label}」的提供商名过长（最多 80 字符）`);
		if (modelProvider.length > 0) entry.modelProvider = modelProvider;
		entry.maxTokens = optionalPositiveInt(raw?.maxTokens ?? defaults.maxTokens, DEFAULT_MAX_TOKENS, "maxTokens");
		entry.maxUses = optionalPositiveInt(raw?.maxUses ?? defaults.maxUses, DEFAULT_MAX_USES, "maxUses");
	} else {
		entry.count = optionalPositiveInt(raw?.count ?? defaults.count, DEFAULT_SEARCH_COUNT, "结果数", MAX_SEARCH_COUNT);
	}
	return entry;
}

function normalizeBaseURL(value, label) {
	const text = typeof value === "string" ? value.trim() : "";
	let url;
	try {
		url = new URL(text);
	} catch {
		throw new Error(`条目「${label}」的 baseURL 不是合法地址`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`条目「${label}」的 baseURL 只能是 http(s)`);
	if (url.username.length > 0 || url.password.length > 0) throw new Error(`条目「${label}」的 baseURL 不能包含用户名密码`);
	if (url.search.length > 0 || url.hash.length > 0) throw new Error(`条目「${label}」的 baseURL 不能包含查询串或片段`);
	const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/u, "");
	if (/(\/messages|\/search)$/u.test(normalized)) throw new Error(`条目「${label}」的 baseURL 不要包含 /messages 或 /search，插件会自动追加`);
	return normalized;
}

/** Validate a whole config document; auto-heals a missing built-in entry. */
function normalizeConfig(raw) {
	if (raw === null || typeof raw !== "object" || !Array.isArray(raw.entries)) throw new Error("缺少 entries 数组");
	const entries = raw.entries.map((entry, index) => normalizeEntry(entry, index));
	for (const id of BUILTIN_IDS) {
		if (!entries.some((entry) => entry.id === id)) entries.unshift(normalizeEntry(builtinDefault(id), 0));
	}
	const seen = new Set();
	for (const entry of entries) {
		if (seen.has(entry.id)) throw new Error(`条目 id 重复：${entry.id}`);
		seen.add(entry.id);
	}
	let defaultId = raw.defaultId === "official" ? OFFICIAL_MESSAGES_ID : raw.defaultId;
	if (typeof defaultId !== "string" || !seen.has(defaultId)) defaultId = entries[0].id;
	return { version: CONFIG_VERSION, defaultId, entries };
}

/** Promote a v1 document (single `official` + custom entries) into v2. */
function migrateConfig(raw) {
	const entries = Array.isArray(raw?.entries) ? raw.entries : [];
	const oldOfficial = entries.find((entry) => entry?.id === "official" || entry?.builtin === "official");
	const others = entries.filter((entry) => entry !== oldOfficial).map((entry) => ({
		...entry,
		protocol: entry?.protocol ?? "anthropic-messages",
		auth: entry?.auth ?? "api-key"
	}));
	const messages = builtinDefault(OFFICIAL_MESSAGES_ID);
	if (typeof oldOfficial?.model === "string" && oldOfficial.model.trim().length > 0) messages.model = oldOfficial.model.trim();
	if (typeof oldOfficial?.apiKeyEnv === "string" && REF_PATTERN.test(oldOfficial.apiKeyEnv)) messages.apiKeyEnv = oldOfficial.apiKeyEnv;
	const search = builtinDefault(OFFICIAL_SEARCH_ID);
	const defaultId = raw?.defaultId === "official" || raw?.defaultId === undefined ? OFFICIAL_MESSAGES_ID : raw.defaultId;
	return { version: CONFIG_VERSION, defaultId, entries: [messages, search, ...others] };
}

function seedConfig() {
	return {
		version: CONFIG_VERSION,
		defaultId: OFFICIAL_MESSAGES_ID,
		entries: [
			builtinDefault(OFFICIAL_MESSAGES_ID),
			builtinDefault(OFFICIAL_SEARCH_ID)
		]
	};
}

function readConfig() {
	const file = configFile();
	let text;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			const seeded = seedConfig();
			writeConfig(seeded);
			return seeded;
		}
		throw new SearchError(`读取网页搜索配置失败：${file}（${error instanceof Error ? error.message : String(error)}）`, "WEB_PROVIDER_ERROR");
	}
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		throw new SearchError(`网页搜索配置文件不是合法 JSON：${file}`, "WEB_PROVIDER_ERROR", { cause: error });
	}
	try {
		const migrated = raw?.version === CONFIG_VERSION ? raw : migrateConfig(raw);
		const config = normalizeConfig(migrated);
		if (raw?.version !== CONFIG_VERSION) writeConfig(config);
		return config;
	} catch (error) {
		throw new SearchError(`网页搜索配置不合法：${error instanceof Error ? error.message : String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
	}
}

function writeConfig(config) {
	const file = configFile();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
	fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	fs.renameSync(temp, file);
}

/** Validate the settings page's draft and produce the next config document. */
function prepareConfig(input, existing) {
	if (input === null || typeof input !== "object" || !Array.isArray(input.entries)) throw new Error("配置格式不正确：缺少 entries 数组");
	if (input.entries.length === 0) throw new Error("至少保留一个搜索条目");
	if (input.entries.length > MAX_ENTRIES) throw new Error(`最多支持 ${MAX_ENTRIES} 个搜索条目`);
	const entries = input.entries.map((raw, index) => normalizeEntry(raw, index));
	const ids = new Set(entries.map((entry) => entry.id));
	for (const id of BUILTIN_IDS) if (!ids.has(id)) throw new Error(`内置条目 ${id} 不能被删除`);
	const defaultId = typeof input.defaultId === "string" && ids.has(input.defaultId) ? input.defaultId : entries[0].id;
	return { version: CONFIG_VERSION, defaultId, entries };
}

function activeEntry(config) {
	const entry = config.entries.find((candidate) => candidate.id === config.defaultId);
	return entry ?? config.entries[0];
}

function findEntry(config, entryId) {
	const entry = config.entries.find((candidate) => candidate.id === entryId);
	if (entry === undefined) throw new SearchError(`网页搜索条目不存在：${String(entryId)}`, "WEB_PROVIDER_ERROR");
	return entry;
}

//#endregion

//#region search

/** Build the Anthropic Messages request for one entry. Exported for tests. */
function buildMessagesRequest(entry, query) {
	const endpoint = `${entry.baseURL.replace(/\/+$/u, "")}/messages`;
	const body = {
		model: entry.model,
		max_tokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
		messages: [{
			role: "user",
			content: [{ type: "text", text: `Perform a web search for the query: ${query}` }]
		}],
		tools: [{
			type: "web_search_20250305",
			name: "web_search",
			max_uses: entry.maxUses ?? DEFAULT_MAX_USES
		}]
	};
	const header = typeof entry.billingHeader === "string" ? entry.billingHeader.trim() : "";
	if (header.length > 0) body.system = [{ type: "text", text: header }];
	return { endpoint, body };
}

/** Build the DeepSeek Search API request for one entry. Exported for tests. */
function buildSearchRequest(entry, query, maxResults) {
	const endpoint = `${entry.baseURL.replace(/\/+$/u, "")}/search`;
	const limit = entry.count ?? DEFAULT_SEARCH_COUNT;
	const count = Math.max(1, Math.min(limit, maxResults ?? limit));
	return { endpoint, body: { query, count, need_content: false } };
}

async function resolveAccountToken(ctx, endpoint) {
	try {
		const token = await ctx.get("deepseekAccount")?.resolveToken?.(endpoint);
		if (typeof token === "string" && token.length > 0) return token;
	} catch {
		// treat as unavailable
	}
	return undefined;
}

async function resolveApiKey(ctx, entry) {
	const ref = entry.apiKeyEnv;
	let value;
	const credentials = ctx.get("credentials");
	if (credentials !== undefined && typeof credentials.resolve === "function") {
		try {
			value = (await credentials.resolve(ref))?.value;
		} catch {
			// fall back to the launch environment
		}
	}
	if (typeof value !== "string" || value.length === 0) {
		const ambient = process.env[ref];
		if (typeof ambient === "string" && ambient.length > 0) value = ambient;
	}
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Resolve the credential for one search according to the entry's auth mode. */
async function resolveAuth(ctx, entry, endpoint) {
	if (entry.auth === "account" || entry.auth === "auto") {
		const token = await resolveAccountToken(ctx, endpoint);
		if (token !== undefined) return { kind: "account", headers: { "x-dsh-auth-token": token } };
		if (entry.auth === "account") {
			throw new SearchError(
				`条目「${entry.label}」配置为账号登录，但当前无法为 ${endpoint} 取得账号 token。请确认已登录 DeepSeek 账号，或把该条目的鉴权改为 API Key。`,
				"WEB_PROVIDER_CREDENTIAL_MISSING"
			);
		}
	}
	const apiKey = await resolveApiKey(ctx, entry);
	if (apiKey === undefined) {
		throw new SearchError(
			`条目「${entry.label}」缺少凭据：${entry.apiKeyEnv}。请在 设置 → 网页搜索 中保存密钥，或把鉴权改为账号登录。`,
			"WEB_PROVIDER_CREDENTIAL_MISSING"
		);
	}
	if (entry.protocol === "deepseek-search") return { kind: "api-key", headers: { authorization: `Bearer ${apiKey}` } };
	return { kind: "api-key", headers: { "x-api-key": apiKey, authorization: `Bearer ${apiKey}` } };
}

/** Record the log-only request event when a session initiated the search. */
function recordRequest(ctx, request) {
	try {
		ctx.get("agents")?.currentInitiator()?.session.append("web/deepseek-search-llm-request", request);
	} catch {
		// logging is best-effort
	}
}

async function safeText(response) {
	try {
		const text = await response.text();
		return text.length > 400 ? `${text.slice(0, 400)}…` : text;
	} catch {
		return "";
	}
}

/** Map an Anthropic Messages response to the seam's normalized sources. */
function mapMessagesResponse(payload) {
	const blocks = Array.isArray(payload?.content) ? payload.content : [];
	const resultBlocks = blocks.filter((block) => block?.type === "web_search_tool_result");
	if (resultBlocks.length === 0) {
		throw new SearchError(
			"端点没有返回 web_search_tool_result：服务端搜索可能未触发。若该端点要求计费头（部分 Anthropic 兼容网关需要），请确认条目的计费头已填写；若是官方 Messages 端点，请确认模型支持服务端 web_search 工具。",
			"WEB_PROVIDER_ERROR"
		);
	}
	const snippets = new Map();
	for (const block of blocks) {
		if (block?.type !== "text") continue;
		for (const cite of block.citations ?? []) {
			if (typeof cite?.url !== "string" || cite.url.length === 0) continue;
			if (typeof cite?.cited_text !== "string" || cite.cited_text.length === 0) continue;
			if (!snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
		}
	}
	const seen = new Set();
	const sources = [];
	for (const block of resultBlocks) {
		for (const item of block.content ?? []) {
			if (item?.type !== "web_search_result" || typeof item.url !== "string" || item.url.length === 0) continue;
			if (seen.has(item.url)) continue;
			seen.add(item.url);
			const source = { url: item.url };
			if (typeof item.title === "string" && item.title.length > 0) source.title = item.title;
			const snippet = snippets.get(item.url);
			if (typeof snippet === "string" && snippet.length > 0) source.snippet = snippet;
			if (typeof item.page_age === "string" && item.page_age.length > 0) source.publishedAt = item.page_age;
			sources.push(source);
		}
	}
	return { sources, truncated: false };
}

/** Map a DeepSeek Search API response to the seam's normalized sources. */
function mapSearchResponse(payload) {
	if (payload === null || typeof payload !== "object" || !Array.isArray(payload.results)) {
		throw new SearchError("官方 Search API 返回格式不正确（缺少 results 数组）", "WEB_PROVIDER_ERROR");
	}
	const sources = [];
	for (const item of payload.results) {
		if (item === null || typeof item !== "object" || typeof item.url !== "string" || item.url.length === 0) continue;
		const source = { url: item.url };
		if (typeof item.title === "string" && item.title.length > 0) source.title = item.title;
		const snippet = typeof item.snippet === "string" && item.snippet.length > 0 ? item.snippet : (typeof item.summary === "string" ? item.summary : "");
		if (snippet.length > 0) source.snippet = snippet;
		if (typeof item.date === "string" && item.date.length > 0) source.publishedAt = item.date;
		sources.push(source);
	}
	if (sources.length === 0) throw new SearchError("官方 Search API 没有返回可用结果", "WEB_PROVIDER_ERROR");
	return { sources, truncated: false };
}

/** Run one search against a specific entry. */
async function runSearch(ctx, entry, query, maxResults, signal) {
	const built = entry.protocol === "deepseek-search" ? buildSearchRequest(entry, query, maxResults) : buildMessagesRequest(entry, query);
	const auth = await resolveAuth(ctx, entry, built.endpoint);
	recordRequest(ctx, {
		endpoint: built.endpoint,
		protocol: entry.protocol,
		...(entry.protocol === "anthropic-messages" ? { apiVersion: ANTHROPIC_VERSION } : {}),
		body: built.body
	});
	const headers = {
		...auth.headers,
		"accept": "application/json",
		"content-type": "application/json",
		"user-agent": USER_AGENT
	};
	if (entry.protocol === "anthropic-messages") headers["anthropic-version"] = ANTHROPIC_VERSION;
	let response;
	try {
		response = await fetch(built.endpoint, {
			method: "POST",
			redirect: "error",
			headers,
			body: JSON.stringify(built.body),
			signal
		});
	} catch (error) {
		if (signal?.aborted === true) throw new SearchError("网页搜索已取消", "WEB_ABORTED", { cause: error });
		throw new SearchError(`网页搜索请求失败（${built.endpoint}）：${error instanceof Error ? error.message : String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
	}
	if (!response.ok) {
		const detail = await safeText(response);
		const guidance = response.status === 401 || response.status === 403
			? "\n\n请检查 设置 → 网页搜索 里该条目的鉴权方式：账号登录是否有效，或 API Key 是否已更换。"
			: "";
		throw new SearchError(`网页搜索端点返回 HTTP ${response.status}${detail.length > 0 ? `：${detail}` : ""}\n端点：${built.endpoint}${guidance}`, "WEB_PROVIDER_ERROR");
	}
	let payload;
	try {
		payload = await response.json();
	} catch (error) {
		throw new SearchError(`网页搜索响应不是合法 JSON（${built.endpoint}）`, "WEB_PROVIDER_ERROR", { cause: error });
	}
	return entry.protocol === "deepseek-search" ? mapSearchResponse(payload) : mapMessagesResponse(payload);
}

//#endregion

//#region provider

class SwitchProvider {
	constructor(ctx) {
		this.ctx = ctx;
		this.id = PROVIDER_ID;
	}

	available() {
		try {
			const config = readConfig();
			const entry = activeEntry(config);
			if (entry === undefined) return false;
			const suffix = entry.protocol === "deepseek-search" ? "/search" : "/messages";
			return URL.canParse(`${entry.baseURL}${suffix}`);
		} catch {
			return false;
		}
	}

	async search(request, signal) {
		const config = readConfig();
		const entry = activeEntry(config);
		return await runSearch(this.ctx, entry, request.query, request.maxResults, signal);
	}
}

//#endregion

//#region http routes

function sendJson(res, status, value) {
	const text = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(text);
}

function isSameOrigin(req) {
	const origin = req.headers.origin;
	if (origin === undefined || origin === "") return true;
	try {
		return new URL(origin).host === req.headers.host;
	} catch {
		return false;
	}
}

async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new SearchError("请求体过大", "WEB_PROVIDER_ERROR");
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim().length === 0) return {};
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new SearchError("请求体不是合法 JSON", "WEB_PROVIDER_ERROR", { cause: error });
	}
}

async function keyConfigured(ctx, ref) {
	const credentials = ctx.get("credentials");
	if (credentials !== undefined && typeof credentials.describe === "function") {
		try {
			const described = await credentials.describe(ref);
			if (described?.configured === true) return true;
		} catch {
			// fall back to the environment
		}
	}
	const ambient = process.env[ref];
	return typeof ambient === "string" && ambient.length > 0;
}

async function handleConfigGet(ctx, req, res) {
	const config = readConfig();
	const entries = [];
	for (const entry of config.entries) {
		entries.push({ ...entry, keyConfigured: await keyConfigured(ctx, entry.apiKeyEnv) });
	}
	const accountToken = await resolveAccountToken(ctx, `${OFFICIAL_MESSAGES_BASE}/messages`);
	sendJson(res, 200, {
		ok: true,
		providerId: PROVIDER_ID,
		configPath: configFile(),
		defaultId: config.defaultId,
		accountAvailable: accountToken !== undefined,
		entries
	});
}

async function handleConfigPut(ctx, req, res) {
	const body = await readJsonBody(req);
	const existing = readConfig();
	const next = prepareConfig(body, existing);
	writeConfig(next);
	sendJson(res, 200, { ok: true });
}

async function handleKey(ctx, req, res) {
	const credentials = ctx.get("credentials");
	if (credentials === undefined) {
		sendJson(res, 503, { ok: false, error: "凭据服务不可用，无法保存密钥" });
		return;
	}
	if (req.method === "PUT") {
		const body = await readJsonBody(req);
		const config = readConfig();
		const entry = findEntry(config, body?.entryId);
		const value = typeof body?.value === "string" ? body.value.trim() : "";
		if (value.length === 0) {
			sendJson(res, 400, { ok: false, error: "密钥不能为空" });
			return;
		}
		await credentials.set(entry.apiKeyEnv, value);
		sendJson(res, 200, { ok: true });
		return;
	}
	if (req.method === "DELETE") {
		const entryId = new URL(req.url ?? "/", "http://localhost").searchParams.get("entryId");
		const config = readConfig();
		const entry = findEntry(config, entryId);
		await credentials.unset(entry.apiKeyEnv);
		sendJson(res, 200, { ok: true });
		return;
	}
	sendJson(res, 405, { ok: false, error: "不支持的请求方法" });
}

async function handleTest(ctx, req, res) {
	const body = await readJsonBody(req);
	const config = readConfig();
	const entry = findEntry(config, body?.entryId ?? config.defaultId);
	const query = typeof body?.query === "string" && body.query.trim().length > 0 ? body.query.trim().slice(0, 300) : "DeepSeek";
	const started = Date.now();
	try {
		const result = await runSearch(ctx, entry, query, 10, AbortSignal.timeout(45000));
		sendJson(res, 200, {
			ok: true,
			protocol: entry.protocol,
			sources: result.sources.slice(0, 3).map((source) => ({ url: source.url, title: source.title ?? "" })),
			count: result.sources.length,
			elapsedMs: Date.now() - started
		});
	} catch (error) {
		sendJson(res, 200, {
			ok: false,
			protocol: entry.protocol,
			elapsedMs: Date.now() - started,
			error: error instanceof Error ? error.message : String(error),
			code: error?.code ?? "WEB_PROVIDER_ERROR"
		});
	}
}

/** Wrap one route: same-origin check plus JSON error mapping. */
function guarded(handler) {
	return (req, res) => {
		if (!isSameOrigin(req)) {
			sendJson(res, 403, { ok: false, error: "只接受同源请求" });
			return;
		}
		Promise.resolve(handler(req, res)).catch((error) => {
			if (res.headersSent) {
				res.destroy();
				return;
			}
			sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
		});
	};
}

/** Build the model catalog from the LLM directory (same source as Settings → Models). */
async function buildCatalog(ctx) {
	const llm = ctx.get("llm");
	const providers = new Map();
	const addProvider = (provider, name) => {
		if (typeof provider !== "string" || provider.length === 0) return;
		if (providers.has(provider)) return;
		providers.set(provider, {
			provider,
			name: typeof name === "string" && name.length > 0 ? name : provider,
			models: []
		});
	};
	try {
		for (const entry of llm?.listConfigurableProviders?.() ?? []) addProvider(entry.provider, entry.displayName);
	} catch {
		// directory unavailable: registered routes below still contribute
	}
	try {
		for (const route of llm?.listProviders?.() ?? []) addProvider(route.id, route.name);
	} catch {
		// ignore
	}
	for (const record of providers.values()) {
		if (typeof llm?.listModels !== "function") break;
		try {
			const models = await llm.listModels(record.provider);
			const seen = new Set();
			for (const model of Array.isArray(models) ? models : []) {
				if (typeof model?.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
				seen.add(model.id);
				record.models.push({ id: model.id, name: typeof model.name === "string" && model.name.length > 0 ? model.name : model.id });
			}
		} catch {
			// one provider's catalog is unavailable; keep the provider with no models
		}
	}
	const official = [];
	const pushOfficial = (id, name) => {
		if (official.some((model) => model.id === id)) return;
		official.push({ id, name: typeof name === "string" && name.length > 0 ? name : id });
	};
	for (const record of providers.values()) {
		if (record.provider !== "deepseek-account" && record.provider !== "deepseek-official") continue;
		for (const model of record.models) pushOfficial(model.id, model.name);
	}
	pushOfficial("deepseek-flash", "DeepSeek Flash");
	pushOfficial("deepseek-v4-pro", "DeepSeek V4 Pro");
	return { providers: [...providers.values()], official, generatedAt: new Date().toISOString() };
}

function registerRoutes(ctx) {
	const routes = [
		{ path: `${ROUTE_PREFIX}/config`, handler: async (req, res) => {
			if (req.method === "GET") return await handleConfigGet(ctx, req, res);
			if (req.method === "PUT") return await handleConfigPut(ctx, req, res);
			sendJson(res, 405, { ok: false, error: "不支持的请求方法" });
		} },
		{ path: `${ROUTE_PREFIX}/key`, handler: (req, res) => handleKey(ctx, req, res) },
		{ path: `${ROUTE_PREFIX}/test`, handler: (req, res) => handleTest(ctx, req, res) },
		{ path: `${ROUTE_PREFIX}/catalog`, handler: async (req, res) => {
			if (req.method !== "GET") {
				sendJson(res, 405, { ok: false, error: "不支持的请求方法" });
				return;
			}
			const catalog = await buildCatalog(ctx);
			sendJson(res, 200, { ok: true, ...catalog });
		} }
	];
	const dispose = [];
	for (const route of routes) {
		dispose.push(ctx.webServer.register({
			kind: "exact",
			path: route.path,
			handler: guarded(route.handler)
		}));
	}
	ctx.effect(() => () => {
		for (const release of dispose) {
			try {
				release();
			} catch {
				// already released
			}
		}
	}, "web-search-switch routes");
}

//#endregion

/** Register the provider and the settings routes. */
function apply(ctx) {
	ctx.web.registerSearchProvider(new SwitchProvider(ctx));
	registerRoutes(ctx);
}

export { name, inject, apply };
export const __test = {
	seedConfig,
	migrateConfig,
	normalizeConfig,
	prepareConfig,
	buildMessagesRequest,
	buildSearchRequest,
	mapMessagesResponse,
	mapSearchResponse,
	buildCatalog
};
