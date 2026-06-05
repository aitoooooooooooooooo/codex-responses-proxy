## ADDED Requirements

### Requirement: 网页配置后台
代理 SHALL 在 `GET /` 返回一个内联的原生 HTML 配置后台，用于查看与编辑配置，无需额外构建或依赖。

#### Scenario: 打开后台
- **WHEN** 用户浏览器访问 `http://localhost:<port>/`
- **THEN** 返回包含渠道列表、模型别名、本地 key、端口、运行状态的可编辑页面

### Requirement: 读取与保存配置
代理 SHALL 提供 `GET /config` 返回当前配置、`POST /config` 校验并保存配置到 `config.json`。

#### Scenario: 读取配置
- **WHEN** 请求 `GET /config`
- **THEN** 返回当前内存配置的 JSON（apiKey 等敏感字段可按需脱敏展示）

#### Scenario: 保存合法配置
- **WHEN** 用户在网页提交合法配置并触发 `POST /config`
- **THEN** 配置写入 `config.json` 且校验通过

#### Scenario: 拒绝非法配置
- **WHEN** 提交的配置缺少必要字段或格式错误（如渠道缺 `baseUrl`）
- **THEN** 返回校验错误且不覆盖现有配置

### Requirement: 配置热更新
除监听端口外，配置保存后 SHALL 立即对后续请求生效，无需重启进程。

#### Scenario: 渠道/别名实时生效
- **WHEN** 用户修改某渠道 apiKey 或新增别名并保存
- **THEN** 下一个进入的请求即使用新配置，无需重启

#### Scenario: 端口改动提示重启
- **WHEN** 用户修改监听端口并保存
- **THEN** 配置被持久化，且网页提示该项需重启进程方可生效

### Requirement: 渠道增删改
后台 SHALL 支持新增、编辑、删除任意 OpenAI-chat 兼容渠道（含 `name/baseUrl/apiKey/models/thinkingStyle`）。

#### Scenario: 新增渠道
- **WHEN** 用户填入名称、baseUrl、key、模型列表并保存
- **THEN** 新渠道加入 `providers` 并参与后续路由

#### Scenario: 删除渠道
- **WHEN** 用户删除某渠道
- **THEN** 该渠道从 `providers` 移除，其模型不再可路由

### Requirement: 连通性测试
代理 SHALL 提供 `POST /test` 用指定渠道的 baseUrl/key/模型向上游发起一次最小请求以验证可用性。

#### Scenario: 测试成功
- **WHEN** 渠道 key 与模型有效，触发 `POST /test`
- **THEN** 返回成功及上游响应摘要

#### Scenario: 测试失败
- **WHEN** key 无效或模型不存在
- **THEN** 返回失败及上游错误信息，便于排错

### Requirement: 运行状态与健康检查
代理 SHALL 提供 `GET /health`（存活）与 `GET /stats`（请求计数/最近日志等运行状态）。

#### Scenario: 健康检查
- **WHEN** 请求 `GET /health`
- **THEN** 返回存活状态与基本信息

#### Scenario: 查看统计
- **WHEN** 请求 `GET /stats`
- **THEN** 返回累计请求数、按渠道/模型的计数及最近若干条请求日志
