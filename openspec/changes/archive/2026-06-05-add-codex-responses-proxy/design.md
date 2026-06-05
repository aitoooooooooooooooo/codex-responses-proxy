## Context

Codex CLI 自 2026 年起只接受 `wire_api = "responses"`，对外发送 OpenAI Responses API 请求（`POST /v1/responses`，流式 SSE）。目标上游（agentrouter、MiMo）则以 Chat Completions 协议对外。两者不兼容，需要一个本地翻译代理。

参考项目：
- **codex-bridge**（~2100 行 Node 单文件）：成熟的 Responses⇄Chat 翻译实现，多供应商路由、流式桥接、effort 映射、`previous_response_id` store。本变更**移植其翻译核心**。
- **agentrouter-proxy**：轻量转发（请求头/重试/日志），借鉴其运维细节。
- **codex-zai-proxy / deepseek-responses-proxy**：分别针对 glm-5.1 / deepseek-v4-pro 的单上游桥，验证了模型名透传 + 无需重启换模型的做法。

约束：Node.js 18+、零第三方依赖、单文件可分发、本地单用户使用。

## Goals / Non-Goals

**Goals:**
- Codex（responses）→ 任意 OpenAI-chat 兼容上游的透明翻译，含流式、工具调用、多轮续接
- 多渠道按模型名路由，网页可视化增删改渠道
- 配置 `config.json` 化 + 保存即热更新（端口除外）
- 入口本地 key 鉴权、连通性测试、运行状态/日志
- 零依赖单文件，`node proxy.mjs` 一把启动

**Non-Goals:**
- web_fetch 内置工具、文件上传/Code Interpreter
- 负载均衡、多 key 轮询、计费统计
- 持久化数据库（store 仅内存，进程重启即清空）
- 上游 Anthropic `/v1/messages` 协议（仅 chat completions）

## Decisions

### D1. 翻译方向：让 Codex 走 responses，代理翻译成 chat
- **为什么**：Codex 已删除 chat 模式，responses 是唯一活路；上游最稳路径是 chat completions。代理在中间各取所长。
- **备选**：直连 agentrouter `/v1/responses`（零代理）——放弃，因不满足"多渠道+网页配置"诉求，且上游 responses 对 glm/deepseek 支持度未知。

### D2. 单文件零依赖 + 内置原生 HTML 后台
- **为什么**：与参考项目一致，免构建免 `npm install`，易分发；后台页面由同一进程在 `GET /` 返回内联 HTML/JS，复用同端口。
- **备选**：前端框架（Vue/React）——放弃，引入构建链与依赖，违背"简单"。

### D3. 渠道模型：通用 channel 列表，按模型名精确匹配路由
- **结构**：`providers[]`，每项含 `name / baseUrl / apiKey / models[] / thinkingStyle`。
- **路由优先级**：① 别名解析 `modelAliases` → ② 在各渠道 `models[]` 精确匹配 → ③ 回退 `defaultProvider`。
- **为什么**：精确匹配最可预测；模型名透传，换模型由 Codex 侧（model 字段/profile）决定，代理无需重启。
- **备选**：前缀/关键词启发式——作为可选增强，v1 用精确匹配为主。

### D4. reasoning effort / thinking 按渠道风格映射
- 每渠道一个 `thinkingStyle`：`deepseek`（`none`→`thinking:{type:"disabled"}`，`xhigh`→`reasoning_effort:"xhigh"`）、`mimo`（`xhigh` 收敛到 `high`，模型名需小写）、`passthrough`（直通）。
- Codex 的 `none|minimal|low|medium|high|xhigh` 按风格翻译到上游可接受形式。

### D5. 多轮续接：内存 LRU store 重建 previous_response_id
- 每次响应缓存其 id 与对话项；下次请求带 `previous_response_id` 时，本地展开历史链并前置到 messages（因 chat 是无状态的）。
- LRU 上限 + TTL，避免内存膨胀。进程重启即丢失（可接受，本地单用户）。

### D6. 配置热更新机制
- 配置以单一内存对象为真相源，`config.json` 为持久化。
- `POST /config` 校验后写文件并替换内存对象；后续请求立即读新值。
- **端口例外**：HTTP server 已绑定旧端口，改端口需重启进程——网页明确提示，不做自动 rebind（v1 简化）。

### D7. 入口鉴权
- `config.localKey` 非空时，校验入站 `Authorization: Bearer`；为空则放行（本地自用允许关闭）。
- 与上游真实 key 解耦：入站用 localKey，出站用对应渠道 apiKey。

## Risks / Trade-offs

- [上游 chat 协议细节差异（thinking 字段、模型名大小写）] → 用 `thinkingStyle` 分风格处理，并提供 `POST /test` 在配置阶段验证。
- [流式 SSE 翻译是最易出错处（事件序列、工具调用分片）] → 严格移植 codex-bridge 已验证的事件序列（`output_item.added`→`output_text.delta`→`output_item.done`→`response.completed`），并写冒烟测试。
- [内存 store 进程重启丢历史] → 本地单用户场景可接受；如需持久化留作后续。
- [改端口需重启] → 网页提示即可；自动 rebind 留作后续增强。
- [模型名映射错误导致路由到错误渠道] → 网页展示"某模型将路由到哪个渠道"，配 `POST /test` 验证。

## Migration Plan

1. 全新项目，无存量数据，无需迁移。
2. 部署：`node proxy.mjs` 启动 → 浏览器打开 `http://localhost:3001/` 填渠道 key → 点测试。
3. Codex 侧：`~/.codex/config.toml` 加自定义 provider（`base_url=http://127.0.0.1:3001/v1`，`wire_api="responses"`），`~/.codex/auth.json` 填 localKey。
4. 回滚：删除 Codex 配置中的自定义 provider 即可，无副作用。

## Open Questions

- agentrouter / MiMo 对 reasoning/thinking 字段的实际接受度需在实现时用 `POST /test` 与真实 key 验证后微调 `thinkingStyle` 默认值。
- MiMo 模型名是否必须全小写需以官方为准（codex-bridge 提示需小写）。
