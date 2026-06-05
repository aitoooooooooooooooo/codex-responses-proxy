## ADDED Requirements

### Requirement: 暴露 Responses API 入口
代理 SHALL 在 `POST /v1/responses` 接收 Codex CLI 的 Responses API 请求，并以 OpenAI Responses 协议（SSE 或非流式 JSON）返回结果。

#### Scenario: 接收非流式请求
- **WHEN** Codex 发送 `POST /v1/responses` 且 `stream` 未开启
- **THEN** 代理返回一个完整的 Responses 对象（含 `id`、`output`、`usage`、`previous_response_id`）

#### Scenario: 接收流式请求
- **WHEN** Codex 发送 `POST /v1/responses` 且 `stream: true`
- **THEN** 代理以 `text/event-stream` 按序回写 Responses 事件并以 `response.completed` 结束

### Requirement: Responses 请求翻译为 Chat Completions
代理 SHALL 将入站 Responses 请求体（`input`、`instructions`、`tools`、`reasoning` 等）翻译为上游可接受的 Chat Completions 请求体（`messages`、`tools`、`reasoning_effort`/`thinking` 等）。

#### Scenario: input 翻译为 messages
- **WHEN** 入站请求含 `input`（字符串或消息数组）与 `instructions`
- **THEN** 代理生成等价的 `messages` 数组（含 system 指令）发往上游

#### Scenario: 工具定义翻译
- **WHEN** 入站请求含 `tools`（函数定义）
- **THEN** 代理将其翻译为 Chat Completions 的 `tools` 格式发往上游

### Requirement: Chat Completions 响应翻译为 Responses
代理 SHALL 将上游 Chat Completions 的响应（含流式分片）翻译回 Responses 协议事件/对象，包括文本输出与工具调用。

#### Scenario: 流式事件序列正确
- **WHEN** 上游以 SSE 分片返回文本
- **THEN** 代理按 `response.created` → `response.output_item.added` → `response.output_text.delta`（多次）→ `response.output_item.done` → `response.completed` 的顺序回写

#### Scenario: 工具调用翻译
- **WHEN** 上游返回 `tool_calls`（含分片的函数名与参数）
- **THEN** 代理聚合为 Responses 的 function call 输出项并正确标注完成

### Requirement: reasoning effort 与 thinking 映射
代理 SHALL 按目标渠道的 `thinkingStyle` 将 Codex 的 reasoning effort（`none|minimal|low|medium|high|xhigh`）翻译为上游可接受的形式。

#### Scenario: deepseek 风格关闭思考
- **WHEN** 渠道 `thinkingStyle` 为 `deepseek` 且 effort 为 `none`
- **THEN** 上游请求体设置 `thinking: { type: "disabled" }` 且不发送 `enable_thinking: false`

#### Scenario: mimo 风格收敛 xhigh
- **WHEN** 渠道 `thinkingStyle` 为 `mimo` 且 effort 为 `xhigh`
- **THEN** 上游 `reasoning_effort` 被收敛为 `high`

#### Scenario: 直通风格
- **WHEN** 渠道 `thinkingStyle` 为 `passthrough`
- **THEN** effort 原样透传给上游

### Requirement: previous_response_id 多轮续接
代理 SHALL 用内存 store 缓存每次响应及其对话项，并在后续请求携带 `previous_response_id` 时重建历史前置到上游 messages。

#### Scenario: 命中历史链
- **WHEN** 请求带 `previous_response_id` 且该 id 在 store 中
- **THEN** 代理展开其历史链并前置到本次 `messages`，上游收到完整上下文

#### Scenario: 未命中历史链
- **WHEN** 请求带 `previous_response_id` 但 store 中不存在（如进程重启后）
- **THEN** 代理记录告警并以当前请求内容继续，不报错中断

#### Scenario: store 容量受限
- **WHEN** 缓存条目超过 LRU 上限或超过 TTL
- **THEN** 最旧/过期条目被淘汰，内存不无限增长
