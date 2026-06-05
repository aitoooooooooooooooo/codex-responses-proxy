## Why

新版 Codex CLI 已彻底移除 `wire_api = "chat"`（2026年2月起硬报错），只支持 OpenAI **Responses API**（`/v1/responses`）。而 agentrouter、MiMo 等上游主要以 **Chat Completions**（`/v1/chat/completions`）对外，导致用户无法在 Codex 里使用 glm-5.1、deepseek-v4-pro、mimo 等模型。

市面上「带网页管理的网关」（如 new-api）不支持 Responses API；「会翻译 Responses 的桥」（codex-bridge 等）又只有环境变量配置、没有可视化界面。本变更要填补这个空白：做一个**本地协议翻译代理 + 网页管理后台**，让 Codex 透明地接入任意 OpenAI-chat 兼容上游，且配置简单、实时生效。

## What Changes

- 新增本地代理服务 `proxy.mjs`（Node.js 单文件、零依赖），对 Codex 暴露 `POST /v1/responses`
- 实现 Responses ⇄ Chat Completions **双向翻译**：含流式 SSE、工具/函数调用、reasoning effort 映射
- 实现**多渠道路由**：按请求 model 名匹配各渠道声明的模型列表，命中即转发到对应上游，认不出走默认渠道
- 实现**会话续接**：用内存 store 重建 `previous_response_id`，保证多轮工具对话不断
- 新增**网页管理后台**（`GET /`，原生 HTML）：渠道增删改、模型别名、本地校验 key、监听端口、运行状态/请求日志
- 新增**配置热更新**：配置存 `config.json`，网页保存后内存即时生效（仅修改端口需重启）
- 新增**入口鉴权**：网页设置本地 key，对入站请求做简单校验
- 新增 `POST /test`（一键测试上游连通性）、`GET /stats`、`GET /health`
- 预置 agentrouter（glm-5.1 / deepseek-v4-pro）与 MiMo（官方端点）两个示例渠道
- 非目标（v1 不做）：web_fetch 内置工具、文件上传、负载均衡/多 key 轮询

## Capabilities

### New Capabilities
- `responses-chat-translation`: Codex 的 Responses API 请求与上游 Chat Completions 之间的双向协议翻译，含流式 SSE、工具调用回放、reasoning effort/thinking 映射、`previous_response_id` 多轮续接
- `multi-provider-routing`: 基于请求模型名的多渠道路由、模型别名解析、默认渠道回退
- `web-config-console`: 浏览器配置后台，管理渠道/别名/端口/本地 key，配置写入 `config.json` 并热更新，含连通性测试与运行状态
- `inbound-auth`: 对入站 Codex 请求基于本地 key 的鉴权校验

### Modified Capabilities
<!-- 无既有 spec，全部为新增 -->

## Impact

- 新增文件：`proxy.mjs`（服务+翻译核心+管理后台）、`config.json`（运行时配置，自动生成）、`README.md`
- 运行环境：Node.js 18+，无第三方依赖
- 外部交互：调用 agentrouter `https://agentrouter.org/v1`、MiMo `https://token-plan-cn.xiaomimimo.com/v1` 等上游
- 用户侧改动：`~/.codex/config.toml` 增加指向本代理的自定义 provider（`wire_api = "responses"`），`~/.codex/auth.json` 填入本地 key
