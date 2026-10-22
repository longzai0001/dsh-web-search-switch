window.__ModuleLoader__.load({
	id: "dsh-web-search-switch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;

		/** Same-origin routes registered by the host half. */
		const CONFIG_ROUTE = "/api/dsh/web-search-switch/config";
		const KEY_ROUTE = "/api/dsh/web-search-switch/key";
		const TEST_ROUTE = "/api/dsh/web-search-switch/test";
		const CATALOG_ROUTE = "/api/dsh/web-search-switch/catalog";

		const PROTOCOL_OPTIONS = [
			["anthropic-messages", "Anthropic Messages（官方 Messages / 自定义）"],
			["deepseek-search", "官方 Search API（/v1/tools/search）"]
		];
		const AUTH_OPTIONS = [
			["account", "账号登录（仅账号 token）"],
			["api-key", "API Key（仅密钥）"],
			["auto", "自动（账号优先，回退 API Key）"]
		];

		const styles = {
			page: { display: "flex", flexDirection: "column", gap: 14, paddingTop: 4, maxWidth: 820 },
			title: { fontSize: 16, fontWeight: 600 },
			intro: { margin: 0, fontSize: 13, lineHeight: 1.7, opacity: 0.72 },
			card: { border: "1px solid rgba(127,127,127,0.32)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 },
			cardActive: { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb inset" },
			cardHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			radio: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" },
			cardTitle: { fontSize: 14, fontWeight: 600 },
			badge: { fontSize: 11, padding: "1px 7px", borderRadius: 999, border: "1px solid rgba(127,127,127,0.45)", opacity: 0.75 },
			badgeActive: { fontSize: 11, padding: "1px 7px", borderRadius: 999, border: "1px solid #2563eb", color: "#2563eb" },
			linkDanger: { marginLeft: "auto", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12, padding: 0 },
			fieldLabel: { fontSize: 12, fontWeight: 600, opacity: 0.8, marginBottom: 4 },
			fieldHint: { fontSize: 11.5, opacity: 0.6, marginTop: 4, lineHeight: 1.6 },
			input: { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", fontSize: 13 },
			inputDisabled: { opacity: 0.6, cursor: "not-allowed" },
			select: { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", fontSize: 13 },
			textarea: { width: "100%", boxSizing: "border-box", minHeight: 56, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", fontSize: 13, fontFamily: "ui-monospace, Consolas, monospace", resize: "vertical" },
			keyRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			button: { padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 },
			primary: { padding: "6px 18px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 },
			toolbar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			toolbarLabel: { fontSize: 12, opacity: 0.7, flexShrink: 0 },
			ok: { fontSize: 12.5, color: "#16a34a" },
			warn: { fontSize: 12.5, color: "#d97706" },
			errorText: { fontSize: 12.5, color: "#dc2626", wordBreak: "break-all" },
			muted: { fontSize: 12.5, opacity: 0.65 },
			messageOk: { fontSize: 13, color: "#16a34a" },
			messageErr: { fontSize: 13, color: "#dc2626" },
			footer: { fontSize: 11.5, opacity: 0.55, lineHeight: 1.6 }
		};

		function errorMessage(error) {
			return error instanceof Error ? error.message : String(error);
		}

		async function requestJson(url, init) {
			const response = await fetch(url, init);
			let data = null;
			try {
				data = await response.json();
			} catch {
				data = null;
			}
			if (!response.ok) throw new Error(data?.error ? String(data.error) : `HTTP ${response.status}`);
			return data;
		}

		function Field(label, control, hint) {
			return h("div", null,
				h("div", { style: styles.fieldLabel }, label),
				control,
				hint ? h("div", { style: styles.fieldHint }, hint) : null
			);
		}

		function TextInput(value, onChange, options = {}) {
			return h("input", {
				style: options.disabled === true ? { ...styles.input, ...styles.inputDisabled } : styles.input,
				value: value ?? "",
				onChange: (event) => onChange(event.target.value),
				placeholder: options.placeholder ?? "",
				disabled: options.disabled === true,
				autoComplete: "off",
				spellCheck: false,
				...options.list ? { list: options.list } : {}
			});
		}

		function NumberInput(value, onChange, options = {}) {
			return h("input", {
				style: options.disabled === true ? { ...styles.input, ...styles.inputDisabled } : styles.input,
				type: "number",
				min: 1,
				max: 50,
				value: value ?? "",
				onChange: (event) => onChange(event.target.value === "" ? "" : Number(event.target.value)),
				disabled: options.disabled === true
			});
		}

		function TextArea(value, onChange, placeholder) {
			return h("textarea", {
				style: styles.textarea,
				value: value ?? "",
				onChange: (event) => onChange(event.target.value),
				placeholder: placeholder ?? "",
				spellCheck: false
			});
		}

		function Select(value, onChange, options, disabled) {
			return h("select", {
				style: disabled === true ? { ...styles.select, ...styles.inputDisabled } : styles.select,
				value: value ?? "",
				disabled: disabled === true,
				onChange: (event) => onChange(event.target.value)
			}, options.map(([optionValue, optionLabel]) => h("option", { key: optionValue, value: optionValue }, optionLabel)));
		}

		function Datalist(id, models) {
			return h("datalist", { id }, (models ?? []).map((model) => h("option", { key: model.id, value: model.id }, model.name)));
		}

		function dedupeModels(lists) {
			const seen = new Set();
			const out = [];
			for (const list of lists) {
				for (const model of list ?? []) {
					if (seen.has(model.id)) continue;
					seen.add(model.id);
					out.push(model);
				}
			}
			return out;
		}

		function SettingsPage() {
			const [state, setState] = React.useState({ loading: true, error: null, accountAvailable: false });
			const [catalog, setCatalog] = React.useState({ providers: [], official: [] });
			const [catalogBusy, setCatalogBusy] = React.useState(false);
			const [draft, setDraft] = React.useState(null);
			const [configPath, setConfigPath] = React.useState("");
			const [keyInputs, setKeyInputs] = React.useState({});
			const [keyBusy, setKeyBusy] = React.useState({});
			const [message, setMessage] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [testQuery, setTestQuery] = React.useState("今天的 AI 行业新闻");
			const [testResults, setTestResults] = React.useState({});

			const applyCatalog = React.useCallback((data) => {
				setCatalog({
					providers: Array.isArray(data?.providers) ? data.providers : [],
					official: Array.isArray(data?.official) ? data.official : []
				});
			}, []);

			const load = React.useCallback(async () => {
				setState((current) => ({ ...current, loading: true, error: null }));
				try {
					const [data, catalogData] = await Promise.all([
						requestJson(CONFIG_ROUTE, { headers: { accept: "application/json" } }),
						requestJson(CATALOG_ROUTE, { headers: { accept: "application/json" } }).catch(() => null)
					]);
					if (catalogData !== null) applyCatalog(catalogData);
					setConfigPath(typeof data?.configPath === "string" ? data.configPath : "");
					setState({ loading: false, error: null, accountAvailable: data?.accountAvailable === true });
					setDraft({
						defaultId: data.defaultId,
						entries: Array.isArray(data.entries) ? data.entries.map((entry) => ({ ...entry })) : []
					});
				} catch (error) {
					setState({ loading: false, error: errorMessage(error), accountAvailable: false });
				}
			}, [applyCatalog]);

			React.useEffect(() => {
				load();
			}, [load]);

			const refreshCatalog = React.useCallback(async () => {
				setCatalogBusy(true);
				try {
					const data = await requestJson(CATALOG_ROUTE, { headers: { accept: "application/json" } });
					applyCatalog(data);
					setMessage({ ok: true, text: "模型列表已刷新。" });
				} catch (error) {
					setMessage({ ok: false, text: `刷新模型列表失败：${errorMessage(error)}` });
				} finally {
					setCatalogBusy(false);
				}
			}, [applyCatalog]);

			const providerOptions = React.useMemo(() => {
				const options = [["", "（不指定，显示全部候选）"]];
				for (const record of catalog.providers) options.push([record.provider, `${record.name}（${record.provider}）`]);
				return options;
			}, [catalog]);

			const modelsOfProvider = React.useCallback((provider) => {
				if (!provider) return dedupeModels(catalog.providers.map((record) => record.models));
				const record = catalog.providers.find((candidate) => candidate.provider === provider);
				if (record !== undefined) return record.models;
				return [];
			}, [catalog]);

			const candidatesFor = React.useCallback((entry) => {
				if (entry.builtin === "official") return catalog.official;
				if (entry.modelProvider) {
					const record = catalog.providers.find((candidate) => candidate.provider === entry.modelProvider);
					if (record !== undefined) return record.models;
				}
				return dedupeModels(catalog.providers.map((record) => record.models));
			}, [catalog]);

			const patchEntry = React.useCallback((index, patch) => {
				setDraft((current) => {
					if (current === null) return current;
					return {
						...current,
						entries: current.entries.map((entry, at) => (at === index ? { ...entry, ...patch } : entry))
					};
				});
			}, []);

			const addEntry = React.useCallback(() => {
				setDraft((current) => {
					if (current === null) return current;
					const suffix = Math.random().toString(36).slice(2, 8);
					const id = `custom-${suffix}`;
					return {
						...current,
						entries: [...current.entries, {
							id,
							label: "新配置",
							protocol: "anthropic-messages",
							auth: "api-key",
							baseURL: "",
							model: "",
							modelProvider: "",
							apiKeyEnv: `WS_${suffix.toUpperCase()}_API_KEY`,
							billingHeader: "",
							keyConfigured: false
						}]
					};
				});
			}, []);

			const removeEntry = React.useCallback((index) => {
				setDraft((current) => {
					if (current === null) return current;
					const removed = current.entries[index];
					if (removed?.builtin === "official") return current;
					const entries = current.entries.filter((_, at) => at !== index);
					const defaultId = current.defaultId === removed?.id ? (entries[0]?.id ?? "") : current.defaultId;
					return { ...current, entries, defaultId };
				});
			}, []);

			const changeProtocol = React.useCallback((index, protocol) => {
				setDraft((current) => {
					if (current === null) return current;
					return {
						...current,
						entries: current.entries.map((entry, at) => {
							if (at !== index) return entry;
							if (protocol === "deepseek-search") return { ...entry, protocol, count: entry.count || 10 };
							const candidates = entry.builtin === "official" ? catalog.official : modelsOfProvider(entry.modelProvider);
							return {
								...entry,
								protocol,
								model: entry.model || candidates[0]?.id || (entry.builtin === "official" ? "deepseek-flash" : ""),
								billingHeader: entry.billingHeader ?? ""
							};
						})
					};
				});
			}, [catalog, modelsOfProvider]);

			const changeProvider = React.useCallback((index, provider) => {
				setDraft((current) => {
					if (current === null) return current;
					return {
						...current,
						entries: current.entries.map((entry, at) => {
							if (at !== index) return entry;
							const first = provider ? modelsOfProvider(provider)[0]?.id : undefined;
							const next = { ...entry, modelProvider: provider };
							if (provider && (typeof entry.model !== "string" || entry.model.trim().length === 0) && first !== undefined) next.model = first;
							return next;
						})
					};
				});
			}, [modelsOfProvider]);

			const save = React.useCallback(async () => {
				if (draft === null) return;
				setBusy(true);
				setMessage(null);
				try {
					const entries = draft.entries.map((entry) => ({
						id: entry.id,
						label: entry.label,
						protocol: entry.protocol,
						auth: entry.auth,
						baseURL: entry.baseURL,
						apiKeyEnv: entry.apiKeyEnv,
						...(entry.protocol === "anthropic-messages"
							? { model: entry.model, billingHeader: entry.billingHeader, ...entry.modelProvider ? { modelProvider: entry.modelProvider } : {} }
							: { count: entry.count })
					}));
					const data = await requestJson(CONFIG_ROUTE, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ defaultId: draft.defaultId, entries })
					});
					if (data?.ok !== true) throw new Error(data?.error ? String(data.error) : "保存失败");
					setMessage({ ok: true, text: "已保存，下一次搜索立即生效。" });
					await load();
				} catch (error) {
					setMessage({ ok: false, text: `保存失败：${errorMessage(error)}` });
				} finally {
					setBusy(false);
				}
			}, [draft, load]);

			const saveKey = React.useCallback(async (entry) => {
				const value = (keyInputs[entry.id] ?? "").trim();
				if (value.length === 0) {
					setMessage({ ok: false, text: "请先输入密钥" });
					return;
				}
				setKeyBusy((current) => ({ ...current, [entry.id]: true }));
				try {
					const data = await requestJson(KEY_ROUTE, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ entryId: entry.id, value })
					});
					if (data?.ok !== true) throw new Error(data?.error ? String(data.error) : "保存失败");
					setKeyInputs((current) => ({ ...current, [entry.id]: "" }));
					setDraft((current) => current === null ? current : {
						...current,
						entries: current.entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, keyConfigured: true } : candidate))
					});
					setMessage({ ok: true, text: `已保存「${entry.label}」的密钥。` });
				} catch (error) {
					setMessage({ ok: false, text: `保存密钥失败：${errorMessage(error)}` });
				} finally {
					setKeyBusy((current) => ({ ...current, [entry.id]: false }));
				}
			}, [keyInputs]);

			const clearKey = React.useCallback(async (entry) => {
				setKeyBusy((current) => ({ ...current, [entry.id]: true }));
				try {
					const data = await requestJson(`${KEY_ROUTE}?entryId=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
					if (data?.ok !== true) throw new Error(data?.error ? String(data.error) : "清除失败");
					setDraft((current) => current === null ? current : {
						...current,
						entries: current.entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, keyConfigured: false } : candidate))
					});
					setMessage({ ok: true, text: `已清除「${entry.label}」的密钥引用。` });
				} catch (error) {
					setMessage({ ok: false, text: `清除密钥失败：${errorMessage(error)}` });
				} finally {
					setKeyBusy((current) => ({ ...current, [entry.id]: false }));
				}
			}, []);

			const runTest = React.useCallback(async (entry) => {
				setTestResults((current) => ({ ...current, [entry.id]: { loading: true } }));
				try {
					const data = await requestJson(TEST_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ entryId: entry.id, query: testQuery })
					});
					setTestResults((current) => ({ ...current, [entry.id]: data ?? { ok: false, error: "空响应" } }));
				} catch (error) {
					setTestResults((current) => ({ ...current, [entry.id]: { ok: false, error: errorMessage(error) } }));
				}
			}, [testQuery]);

			if (state.loading && draft === null) return h("div", { style: styles.muted }, "正在加载网页搜索配置…");
			if (state.error !== null && draft === null) {
				return h("div", { style: styles.page },
					h("div", { style: styles.errorText }, `读取配置失败：${state.error}`),
					h("button", { type: "button", style: styles.button, onClick: load }, "重试")
				);
			}
			if (draft === null) return null;

			const providerCount = catalog.providers.length;
			const modelCount = dedupeModels(catalog.providers.map((record) => record.models)).length;

			const cards = draft.entries.map((entry, index) => {
				const builtin = entry.builtin === "official";
				const isDefault = draft.defaultId === entry.id;
				const test = testResults[entry.id];
				const isMessages = entry.protocol !== "deepseek-search";
				const usesAccount = entry.auth === "account" || entry.auth === "auto";
				const listId = `wss-models-${entry.id}`;
				return h("div", { key: entry.id, style: isDefault ? { ...styles.card, ...styles.cardActive } : styles.card },
					h("div", { style: styles.cardHead },
						h("label", { style: styles.radio },
							h("input", {
								type: "radio",
								name: "web-search-default",
								checked: isDefault,
								onChange: () => setDraft((current) => current === null ? current : { ...current, defaultId: entry.id })
							}),
							h("span", { style: styles.cardTitle }, entry.label || entry.id)
						),
						isDefault ? h("span", { style: styles.badgeActive }, "默认") : null,
						builtin ? h("span", { style: styles.badge }, "内置") : null,
						builtin ? null : h("button", { type: "button", style: styles.linkDanger, onClick: () => removeEntry(index) }, "删除")
					),
					Field("名称", TextInput(entry.label, (value) => patchEntry(index, { label: value }))),
					Field(
						"协议",
						Select(entry.protocol ?? "anthropic-messages", (value) => changeProtocol(index, value), PROTOCOL_OPTIONS, builtin),
						builtin ? "内置条目的协议固定。" : "Messages 适合 Anthropic 兼容端点；Search API 适合官方或兼容代理。"
					),
					Field(
						"鉴权",
						Select(entry.auth ?? "api-key", (value) => patchEntry(index, { auth: value }), AUTH_OPTIONS),
						usesAccount ? (state.accountAvailable ? "账号：已登录（会优先使用账号 token）。" : "账号：未登录（账号模式会失败，请改用 API Key）。") : undefined
					),
					Field(
						"baseURL",
						TextInput(entry.baseURL, (value) => patchEntry(index, { baseURL: value }), { disabled: builtin, placeholder: isMessages ? "https://example.com/apps/anthropic/v1" : "https://api.deepseek.com/v1/tools" }),
						builtin ? "内置条目的端点固定不可改。" : (isMessages ? "填到 /v1 为止，插件自动追加 /messages。" : "填到 /v1/tools 为止，插件自动追加 /search。")
					),
					isMessages && !builtin
						? Field(
							"提供商",
							Select(entry.modelProvider ?? "", (value) => changeProvider(index, value), providerOptions),
							"来自 设置 → 模型；只用于筛选模型候选，不参与搜索请求。"
						)
						: null,
					isMessages
						? Field(
							"模型",
							h("div", null,
								TextInput(entry.model, (value) => patchEntry(index, { model: value }), { placeholder: "deepseek-flash", list: listId }),
								Datalist(listId, candidatesFor(entry))
							),
							builtin
								? "下拉来自官方 provider 的模型（缺省时用内置官方候选），也可以直接手填。"
								: "下拉来自所选提供商的模型；没有合适项时直接手填。"
						)
						: Field("结果数", NumberInput(entry.count, (value) => patchEntry(index, { count: value }), { placeholder: "10" }), "1-50，实际请求还会被工具的结果上限截断。"),
					Field(
						"凭据引用名",
						TextInput(entry.apiKeyEnv, (value) => patchEntry(index, { apiKeyEnv: value }), { placeholder: "DEEPSEEK_API_KEY" }),
						entry.auth === "account" ? "当前是账号登录模式，这个 Key 不参与鉴权。" : "Key 保存在 DSH 凭据库；账号模式下不参与鉴权。"
					),
					isMessages
						? Field(
							"计费头（可选）",
							TextArea(entry.billingHeader, (value) => patchEntry(index, { billingHeader: value }), "x-anthropic-billing-header: cc_entrypoint=cli;"),
							"部分 Anthropic 兼容网关要求填写（按其文档）；官方 Messages 端点留空。留空时请求体不带 system 字段。"
						)
						: null,
					h("div", { style: styles.keyRow },
						h("span", { style: entry.keyConfigured ? styles.ok : styles.warn }, entry.keyConfigured ? "密钥已配置" : "密钥未配置"),
						h("input", {
							type: "password",
							style: { ...styles.input, flex: "1 1 260px" },
							value: keyInputs[entry.id] ?? "",
							placeholder: `输入 ${entry.apiKeyEnv} 的值`,
							onChange: (event) => setKeyInputs((current) => ({ ...current, [entry.id]: event.target.value })),
							autoComplete: "off",
							spellCheck: false
						}),
						h("button", {
							type: "button",
							style: styles.button,
							disabled: keyBusy[entry.id] === true,
							onClick: () => saveKey(entry)
						}, keyBusy[entry.id] === true ? "保存中…" : "保存密钥"),
						entry.keyConfigured ? h("button", { type: "button", style: styles.linkDanger, onClick: () => clearKey(entry) }, "清除") : null
					),
					h("div", { style: styles.keyRow },
						h("button", {
							type: "button",
							style: styles.button,
							disabled: test?.loading === true,
							onClick: () => runTest(entry)
						}, test?.loading === true ? "测试中…" : "测试连接"),
						test === undefined ? null : test.loading === true
							? h("span", { style: styles.muted }, "请求中…")
							: test.ok === true
								? h("span", { style: styles.ok }, `成功：${test.count} 条结果，${test.elapsedMs}ms${test.sources?.[0]?.url ? `，首条 ${test.sources[0].url}` : ""}`)
								: h("span", { style: styles.errorText }, `失败：${test.error}`)
					)
				);
			});

			return h("div", { style: styles.page },
				h("div", null,
					h("div", { style: styles.title }, "网页搜索"),
					h("p", { style: styles.intro }, "管理官方搜索与自定义搜索端点，选中一个作为默认。内置两条官方条目：Messages（账号登录）和 Search API（API Key）；其他 Anthropic 兼容端点用自定义条目，可选择提供商来自动填充模型候选。保存后下一次搜索立即生效。")
				),
				message !== null ? h("div", { style: message.ok ? styles.messageOk : styles.messageErr }, message.text) : null,
				h("div", { style: styles.toolbar },
					h("span", { style: styles.toolbarLabel }, `模型候选：${providerCount} 个提供商 / ${modelCount} 个模型`),
					h("button", { type: "button", style: styles.button, disabled: catalogBusy, onClick: refreshCatalog }, catalogBusy ? "刷新中…" : "刷新模型列表")
				),
				h("div", { style: styles.toolbar },
					h("span", { style: styles.toolbarLabel }, "测试问题"),
					h("input", {
						style: styles.input,
						value: testQuery,
						onChange: (event) => setTestQuery(event.target.value),
						placeholder: "输入一个测试问题，再用下方卡片的「测试连接」",
						spellCheck: false
					})
				),
				...cards,
				h("div", { style: styles.toolbar },
					h("button", { type: "button", style: styles.button, onClick: addEntry }, "添加配置"),
					h("button", { type: "button", style: styles.primary, disabled: busy, onClick: save }, busy ? "保存中…" : "保存")
				),
				h("div", { style: styles.footer },
					"配置文件：",
					h("code", null, configPath || "~/.dsh/web-search-switch.json"),
					"；密钥保存到 DSH 凭据库，不写入该文件。模型候选来自 设置 → 模型，修改后点「刷新模型列表」即可。"
				)
			);
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "web-search-switch",
				order: 12,
				label: () => "网页搜索",
				inject: () => ({})
			}, SettingsPage));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
