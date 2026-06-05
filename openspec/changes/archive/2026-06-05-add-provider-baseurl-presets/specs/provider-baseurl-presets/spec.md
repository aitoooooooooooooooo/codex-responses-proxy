## ADDED Requirements

### Requirement: 维护常用上游 Base URL 预设库

代理 SHALL 在代码中维护一份只读的常用 OpenAI 兼容上游预设列表，每项至少包含：`id`、`label`、`name`、`baseUrl`、`thinkingStyle`、建议 `models[]`。

#### Scenario: 预设包含 agentrouter 与 MiMo

- **WHEN** 客户端读取预设列表
- **THEN** 列表中包含 agentrouter（`https://agentrouter.org/v1`）与 MiMo 国内端点（`https://token-plan-cn.xiaomimimo.com/v1`）

#### Scenario: 预设包含 DeepSeek 与智谱 GLM

- **WHEN** 客户端读取预设列表
- **THEN** 列表中包含 DeepSeek（`https://api.deepseek.com/v1`）与智谱 GLM OpenAI 兼容端点

#### Scenario: 预设包含 MiniMax 国内与国际

- **WHEN** 客户端读取预设列表
- **THEN** 列表中包含 MiniMax 国内（`https://api.minimaxi.com/v1`）与国际（`https://api.minimax.io/v1`）端点

### Requirement: 通过配置 API 暴露预设

代理 SHALL 在 `GET /config` 响应中返回 `providerPresets` 字段，内容为预设数组，且不写入 `config.json` 持久化。

#### Scenario: 读取配置含预设

- **WHEN** 请求 `GET /config`
- **THEN** 响应 JSON 含 `providerPresets` 数组，长度 ≥ 1

#### Scenario: 保存配置不持久化预设

- **WHEN** 用户 `POST /config` 保存渠道
- **THEN** `config.json` 中不出现 `providerPresets` 字段
