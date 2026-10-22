# dsh-web-search-switch

DSH（DeepSeek Harness）桌面端的**网页搜索多端点管理插件**：把 `web_search` 的搜索通道做成一页可管理的配置——官方 Messages、官方 Search API，以及任意 Anthropic 兼容端点，在设置页里选一个作为默认。

- 设置 → 左侧「网页搜索」，右侧管理所有搜索条目；
- 内置两条官方条目：官方搜索（账号）、官方搜索（API）；其余都是自定义条目；
- 两种协议：Anthropic Messages、DeepSeek 官方 Search API；
- 三种鉴权：账号登录 / API Key / 自动（账号优先）；
- 计费头按条目手动配置（部分兼容端点需要，官方不需要）；
- 模型候选来自「设置 → 模型」，支持下拉联想 + 手填；
- 全局一个默认，保存后下一次搜索立即生效。

要求：DSH 桌面版 **>= 0.2.1-rc.2**，profile 为 `desktop`。

## 安装

```bash
dsh plugin --profile desktop add dsh-web-search-switch
```

安装后**完全退出并重启桌面端**（宿主插件在启动时加载）。

> `dsh` 是 DSH 自带的命令行工具。如果它不在 PATH，用安装目录下的 CLI 执行同一条命令即可
> （Windows：`resources\runtime\cli\bin\dsh.cmd`；其他平台：安装目录下的 `dsh`）。

### 从 GitHub Release 安装（可选）

从 [Releases](https://github.com/longzai0001/dsh-web-search-switch/releases) 下载 `dsh-web-search-switch-<版本>.tgz`，然后：

```bash
dsh plugin --profile desktop add ./dsh-web-search-switch-<版本>.tgz
```

### 从源码安装（可选）

```bash
pnpm pack
dsh plugin --profile desktop add ./dsh-web-search-switch-<版本>.tgz
```

## 快速开始

1. 重启桌面端后，打开 **设置 → 左侧「网页搜索」**；
2. 页面里应有内置的两条官方条目（其余是你添加的自定义条目）；
3. 点某条的 **「测试连接」**，确认能返回结果；
4. 用左侧单选把想要的条目设为默认，点 **「保存」**；
5. 回到会话里让模型搜索即可，下一次搜索立即使用新默认。

## 内置条目

| 条目 | 协议 | 默认鉴权 | 端点 | 模型 |
|---|---|---|---|---|
| 官方搜索（账号） | Anthropic Messages + `web_search_20250305` | 账号登录 | `https://api.deepseek.com/anthropic/v1`（只读） | 可改，默认 `deepseek-flash` |
| 官方搜索（API） | DeepSeek Search API | API Key | `https://api.deepseek.com/v1/tools`（只读） | 无（该接口不需要） |

- 两个官方条目不可删除、端点只读；鉴权可在下拉里切换；
- 「官方搜索（API）」走 `POST /v1/tools/search`，不消耗模型 token，通常几十毫秒返回；
- 「官方搜索（账号）」走 Messages，一次搜索是一次模型调用，通常几秒到几十秒。

## 自定义端点

点「添加配置」：

1. **协议**：一般选 `Anthropic Messages`（任何 Anthropic 兼容端点）；`官方 Search API` 仅用于官方或兼容代理；
2. **鉴权**：
   - `账号登录`：只发 `x-dsh-auth-token`，未登录会报错；
   - `API Key`：Messages 发 `x-api-key` + `Authorization: Bearer`，Search API 只发 Bearer；
   - `自动`：账号优先，取不到再回退 API Key；
3. **baseURL**：填到 `/v1` 为止（插件自动追加 `/messages`），Search API 填到 `/v1/tools`；
4. **提供商**（仅 Messages）：从「设置 → 模型」里的 provider 选择，用于筛选模型候选，不参与搜索请求；
5. **模型**：下拉候选或直接手填；必须用该端点支持的模型名，不要直接套用聊天侧的模型 id；
6. **计费头**（仅 Messages，可选）：某些 Anthropic 兼容网关要求请求里带一行 system 文本才会触发服务端搜索；需要时按该网关的文档填写，不需要则留空；
7. **凭据引用名**：密钥在 DSH 凭据库里的名字（如 `DEEPSEEK_API_KEY` 或你自己的名字），可在卡片里直接填密钥保存；
8. **结果数**（仅 Search API）：1-50；
9. 保存后即可设为默认。

## 模型候选

- 官方（账号）条目：候选来自 `deepseek-account` / `deepseek-official` 在「设置 → 模型」里的模型，并兜底 `deepseek-flash`、`deepseek-v4-pro`；
- 自定义条目：先选「提供商」，候选即该 provider 的模型；不选则显示全部候选；
- 页面顶部「刷新模型列表」可在修改「设置 → 模型」后重新拉取；
- 某 provider 的 key 解析不到时，DSH 返回的模型列表为空（下拉没候选），但仍可直接手填。

## 配置文件与凭据

- 运行时配置：`~/.dsh/web-search-switch.json`（首次启动自动生成，v1 会自动迁移到 v2）；
- 密钥：保存在 DSH 凭据库（`~/.dsh/.credentials.yaml`），不写入上述 JSON；
- 插件注册的 provider id 是 `deepseek-official`，`web.searchProvider` 保持这个值即可。

## 常见问题

**设置左侧没有「网页搜索」**
插件没被宿主加载。确认已安装并**重启桌面端**；检查 profile 的 `package.json` 里 `dsh.profile.bundles` 是否包含 `dsh-web-search-switch`。

**搜索报 `WEB_PROVIDER_CONFIGURED_MISSING`**
`web.searchProvider` 被改成了别的 id。改回 `deepseek-official`（profile 的 `cordis.patch.yml` 或设置页）。

**测试连接 401**
鉴权方式或密钥不对：
- 官方（账号）：确认已登录 DeepSeek 账号；
- API Key：确认凭据库里的 key 有效（`sk-` 开头）；
- 自定义端点：确认凭据引用名对应的 key 在凭据库里有效。

**官方（账号）测试失败，但真实会话能搜？**
不会出现：插件在测试和真实搜索里都优先用账号 token。若账号已退出，请重新登录或把鉴权改为 API Key。

**某端点返回「没有 web_search_tool_result」**
先确认该条目是否需要计费头（部分兼容网关必需）；计费头没填或写错时会静默降级，按网关文档补齐后保存。

**报 `missing field model` / 模型 404**
Messages 协议的 `model` 是必填项，且必须是该端点认识的名字；官方用 `deepseek-flash`/`deepseek-v4-pro`，自定义端点按该端点的模型名填。

**官方 Search API 条目没有模型字段**
正常：`/v1/tools/search` 不接受模型，也不需要。

**结果被截断**
工具层有结果上限，提供商返回更多时会被截断，属正常行为。

**和旧插件冲突**
如果之前装过其他搜索插件或手工 vendor 条目，只保留一个注册 `deepseek-official` 的条目；旧的请在 profile 的 `cordis.patch.yml` 里置 `disabled: true`。

## 卸载与回退

```bash
dsh plugin --profile desktop remove dsh-web-search-switch
```

然后重启桌面端。`~/.dsh/web-search-switch.json` 与凭据会保留，重装后继续使用。

## 开发与适配 DSH 升级

插件装在 profile 依赖里，升级 DSH 不会删除。若接口变化导致设置页异常：

1. 修改 `lib/index.js`（宿主：provider 与路由）或 `lib/client.js`（设置页）；
2. 修改 `package.json` 版本号；
3. `pnpm pack` → `dsh plugin --profile desktop add <新tgz>` → 重启。

目录结构：

```text
lib/index.js        宿主：provider（deepseek-official）、配置读写、同源路由
lib/client.js       客户端：设置页（settings.section，手写、无构建）
cordis.patch.yml    bundle 补丁：插入 web-search-switch 条目
```

## License

[MIT](./LICENSE) © 2026 longzai0001
