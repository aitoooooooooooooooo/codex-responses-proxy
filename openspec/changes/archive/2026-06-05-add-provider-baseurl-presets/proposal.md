## Why

添加渠道时用户需要手动查找并输入完整的 `baseUrl`（如 agentrouter、MiMo、DeepSeek、智谱 GLM、MiniMax 等），容易输错路径或漏写 `/v1` 后缀，增加配置成本。项目已内置部分预置渠道，但「+ 添加渠道」流程仍从空白表单开始。

## What Changes

- 提供**常用上游 Base URL 预设库**（官方/公开 OpenAI 兼容端点），在网页「渠道」页一键选用
- 选择预设后自动填充 `name`、`baseUrl`、建议 `thinkingStyle`、示例 `models[]`（用户可改）
- 预设列表由服务端维护（`proxy.mjs` 常量 + `GET /config` 返回），便于后续增删
- 保留「空白自定义渠道」入口，不限制用户手填 URL

## Capabilities

### New Capabilities

- `provider-baseurl-presets`: 维护与暴露常用上游 Base URL 模板，供控制台选用

### Modified Capabilities

- `web-config-console`: 渠道添加/编辑 UI 增加预设选择与自动填充行为

## Impact

- `proxy.mjs`：新增 `PROVIDER_PRESETS` 常量，`publicConfig` 或独立字段返回预设列表
- `console.html`：渠道页增加预设选择器（下拉或快捷卡片）
- `README.md`：补充预设列表说明
- 无新运行时依赖；无配置 schema 破坏性变更
