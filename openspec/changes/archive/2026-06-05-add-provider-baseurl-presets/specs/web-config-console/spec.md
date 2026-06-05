## MODIFIED Requirements

### Requirement: 渠道增删改

后台 SHALL 支持新增、编辑、删除任意 OpenAI-chat 兼容渠道（含 `name/baseUrl/apiKey/models/thinkingStyle`）。新增渠道时 SHALL 支持从常用 Base URL 预设一键填充上述字段。

#### Scenario: 新增渠道

- **WHEN** 用户填入名称、baseUrl、key、模型列表并保存
- **THEN** 新渠道加入 `providers` 并参与后续路由

#### Scenario: 从预设添加渠道

- **WHEN** 用户在渠道页选择某预设（如 MiMo）并确认添加
- **THEN** 新建渠道卡片，且 `baseUrl`、`thinkingStyle`、建议模型列表按预设自动填充，用户仅需补充 API Key

#### Scenario: 预设与空白添加并存

- **WHEN** 用户点击「+ 添加空白渠道」
- **THEN** 仍创建未填充 baseUrl 的空白渠道卡片，行为与改动前兼容

#### Scenario: 删除渠道

- **WHEN** 用户删除某渠道
- **THEN** 该渠道从 `providers` 移除，其模型不再可路由
