## ADDED Requirements

### Requirement: 模型别名解析
代理 SHALL 在路由前先用 `modelAliases` 将入站模型名替换为目标模型名。

#### Scenario: 命中别名
- **WHEN** 入站 `model` 为 `gpt-5` 且 `modelAliases` 含 `"gpt-5": "glm-5.1"`
- **THEN** 后续路由与上游请求使用 `glm-5.1`

#### Scenario: 无别名
- **WHEN** 入站 `model` 不在 `modelAliases` 中
- **THEN** 模型名保持不变

### Requirement: 按模型名路由到渠道
代理 SHALL 按（别名解析后的）模型名在各渠道声明的 `models[]` 中精确匹配，命中则转发到该渠道对应的 `baseUrl` 与 `apiKey`。

#### Scenario: 精确命中渠道
- **WHEN** 解析后模型为 `deepseek-v4-pro` 且某渠道 `models` 含该名
- **THEN** 请求被转发到该渠道的 `baseUrl`，并使用该渠道 `apiKey` 鉴权上游

#### Scenario: 多渠道隔离
- **WHEN** 模型为 `mimo-v2.5-pro` 且仅 MiMo 渠道声明该模型
- **THEN** 请求发往 MiMo 官方端点，使用 MiMo 渠道独立的 key

### Requirement: 默认渠道回退
当模型名在所有渠道 `models[]` 中均未匹配时，代理 SHALL 回退到 `defaultProvider` 指定的渠道。

#### Scenario: 未知模型回退
- **WHEN** 入站模型未被任何渠道声明且 `defaultProvider` 已配置
- **THEN** 请求转发到默认渠道

#### Scenario: 无默认且无匹配
- **WHEN** 模型未匹配任何渠道且未配置 `defaultProvider`
- **THEN** 代理返回明确的错误（如模型未配置渠道），不静默失败

### Requirement: 上游请求头处理
代理 SHALL 为上游请求设置正确的 `Authorization` 与 `Content-Type`，并支持渠道级自定义请求头。

#### Scenario: 上游鉴权头
- **WHEN** 转发到某渠道
- **THEN** 请求头包含 `Authorization: Bearer <该渠道 apiKey>`
