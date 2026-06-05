## ADDED Requirements

### Requirement: 入口本地 key 校验
当 `config.localKey` 非空时，代理 SHALL 校验入站请求的 `Authorization: Bearer <key>` 是否与 localKey 一致；不一致则拒绝。

#### Scenario: key 匹配放行
- **WHEN** 入站请求头携带与 `localKey` 一致的 Bearer token
- **THEN** 请求被正常处理

#### Scenario: key 不匹配拒绝
- **WHEN** 入站请求缺失 token 或与 `localKey` 不一致
- **THEN** 代理返回 401 且不转发上游

### Requirement: 可关闭鉴权
当 `config.localKey` 为空时，代理 SHALL 放行所有入站请求（用于本地自用免鉴权）。

#### Scenario: 空 key 放行
- **WHEN** `localKey` 为空且收到任意入站请求
- **THEN** 请求被正常处理，不校验 token

### Requirement: 入站与上游凭据隔离
代理 SHALL 使用 `localKey` 校验入站，使用对应渠道的 `apiKey` 鉴权上游，二者互不混用。

#### Scenario: 凭据分离
- **WHEN** 入站用 localKey 通过校验后路由到某渠道
- **THEN** 发往上游的请求使用该渠道 apiKey，而非 localKey

#### Scenario: 健康检查免鉴权
- **WHEN** 请求 `GET /health`
- **THEN** 无需 localKey 即可访问
