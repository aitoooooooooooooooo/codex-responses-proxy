## Context

当前 `console.html` 的「+ 添加渠道」创建空白卡片（`baseUrl: "https://"`），用户需自行查阅各厂商文档。项目默认 `config.json` 已含 agentrouter 与 MiMo 示例，但新增第三渠道时体验不一致。

控制台为零依赖单 HTML，预设数据宜由服务端单点维护，避免 HTML 与 README 双份硬编码漂移。

## Goals / Non-Goals

**Goals:**

- 在渠道页提供 ≥6 个常用预设（agentrouter、MiMo、DeepSeek、智谱 GLM、MiniMax 国内/国际等）
- 点选预设后自动填充 baseUrl 及推荐字段，用户只需填 API Key
- 预设随 `GET /config` 下发，控制台无需硬编码 URL 列表

**Non-Goals:**

- 不做上游连通性自动探测或 OAuth 登录
- 不替用户申请/管理 API Key
- 不支持用户自定义预设持久化（后续可另开 change）
- 不改动路由/翻译逻辑

## Decisions

### 1. 预设数据结构

```javascript
{
  id: "mimo-cn",
  label: "MiMo（国内）",
  name: "mimo",
  baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
  thinkingStyle: "mimo",
  models: ["mimo-v2.5-pro", "mimo-v2.5"],
  docsUrl: "https://platform.xiaomimimo.com/docs"
}
```

`id` 稳定标识；`label` 用于 UI；`name`/`baseUrl`/`thinkingStyle`/`models` 写入渠道表单。

### 2. 暴露方式

在 `publicConfig()` 返回值中增加 `providerPresets: PROVIDER_PRESETS`（只读，不写入 `config.json`）。

**备选：** 独立 `GET /config/presets` — 否决，减少端点数量。

### 3. UI 交互

渠道列表上方增加「从模板添加」下拉 +「添加」按钮；选中模板后插入新渠道卡片并预填字段。现有「+ 添加渠道」保留为空白渠道。

**备选：** Base URL 输入框 `<datalist>` — 只能补 URL，无法带 models/style，体验不完整。

### 4. 初始预设清单

| id | label | baseUrl |
|----|-------|---------|
| agentrouter | AgentRouter | `https://agentrouter.org/v1` |
| mimo-cn | MiMo（国内） | `https://token-plan-cn.xiaomimimo.com/v1` |
| mimo-global | MiMo（国际） | `https://api.xiaomimimo.com/v1` |
| deepseek | DeepSeek | `https://api.deepseek.com/v1` |
| zhipu | 智谱 GLM | `https://open.bigmodel.cn/api/coding/paas/v4` |
| minimax-cn | MiniMax（国内） | `https://api.minimaxi.com/v1` |
| minimax-global | MiniMax（国际） | `https://api.minimax.io/v1` |

各预设附带 `thinkingStyle` 与示例模型名（来自官方文档或项目已验证值）。URL 变更时只改 `PROVIDER_PRESETS` 一处。

### 5. agentrouter 专用 headers

选择 agentrouter 预设时，若渠道无 headers，UI 提示保存后将使用服务端默认 Roo Code headers（现有 `AGENTROUTER_DEFAULT_HEADERS` 逻辑不变）。

## Risks / Trade-offs

- [官方 URL 变更] → 预设带 `docsUrl`，README 注明以官方文档为准；版本更新时改常量
- [同名渠道冲突] → 从模板添加时若 `name` 已存在，自动后缀 `-2` 或提示用户改名
- [模型名过时] → 预设 models 仅为建议，用户可编辑；不强制

## Migration Plan

1. 部署新版本 `proxy.mjs` + `console.html`
2. 已有 `config.json` 无迁移；用户可选预设添加新渠道
3. 回滚：移除预设 UI，不影响已有 providers

## Open Questions

- 智谱是否统一用 coding 端点还是通用 `paas/v4`？初版采用 coding 端点（Codex 场景更常见）
- 是否需要在预设中标注「需额外 headers」？agentrouter 可在 label 加「需 Roo 头（已内置）」
