## 1. 项目骨架

- [x] 1.1 创建 `package.json`（`"type": "module"`、Node 18+、零运行时依赖、`start` 脚本）
- [x] 1.2 创建 `proxy.mjs` 入口骨架（http server、日志器、全局异常捕获）
- [x] 1.3 创建 `README.md`（启动方式、Codex 配置示例、渠道说明）

## 2. 配置与热更新

- [x] 2.1 定义 `config.json` 默认结构（port/localKey/defaultProvider/modelAliases/providers[]）
- [x] 2.2 启动时读取 `config.json`，不存在则生成默认文件
- [x] 2.3 内存配置对象作为真相源，封装 `getConfig()`/`setConfig()`
- [x] 2.4 实现配置校验（必填字段、渠道结构、端口合法性）
- [x] 2.5 `POST /config` 写文件 + 替换内存对象（热更新）；端口改动标记需重启

## 3. 入口鉴权

- [x] 3.1 实现 Bearer token 解析
- [x] 3.2 localKey 非空时校验入站，不匹配返回 401
- [x] 3.3 localKey 为空时放行；`/health` 始终免鉴权
- [x] 3.4 确保上游使用渠道 apiKey、入站使用 localKey（凭据隔离）

## 4. 多渠道路由

- [x] 4.1 实现 `modelAliases` 别名解析
- [x] 4.2 实现按模型名在各渠道 `models[]` 精确匹配
- [x] 4.3 实现 `defaultProvider` 回退；无匹配且无默认时返回明确错误
- [x] 4.4 组装上游请求头（Authorization/Content-Type + 渠道自定义头）

## 5. 翻译核心（移植 codex-bridge）

- [x] 5.1 移植 `responsesRequestToChatCompletions`：input/instructions → messages，tools 翻译
- [x] 5.2 移植 `applyEffortTranslation`，按渠道 `thinkingStyle`（deepseek/mimo/passthrough）映射
- [x] 5.3 移植 `chatCompletionToResponse`：非流式 chat 响应 → Responses 对象
- [x] 5.4 移植 `handleStreamingResponse`：上游 SSE → Responses 事件序列
- [x] 5.5 移植 Responses 事件骨架（created/output_item.added/output_text.delta/output_item.done/completed）
- [x] 5.6 实现工具调用聚合（分片函数名/参数 → function call 输出项）
- [x] 5.7 实现客户端断开取消与上游错误透传

## 6. 多轮会话续接

- [x] 6.1 实现内存 LRU store（TTL + 容量上限）
- [x] 6.2 响应完成后缓存 id 与对话项
- [x] 6.3 请求带 `previous_response_id` 时展开历史链并前置 messages
- [x] 6.4 未命中历史时告警并继续，不中断

## 7. HTTP 端点

- [x] 7.1 `POST /v1/responses`（主入口：鉴权 → 别名 → 路由 → 翻译 → 转发 → 回写）
- [x] 7.2 `POST /test`（指定渠道发最小请求验证连通性）
- [x] 7.3 `GET /health`、`GET /stats`（请求计数/最近日志）
- [x] 7.4 `GET /v1/models`（合并各渠道模型列表，兼容性）

## 8. 网页管理后台

- [x] 8.1 `GET /` 返回内联原生 HTML 后台页
- [x] 8.2 页面：渠道列表增删改表单（name/baseUrl/apiKey/models/thinkingStyle）
- [x] 8.3 页面：模型别名、本地 key、端口编辑
- [x] 8.4 页面：保存调用 `POST /config`，端口项显示"需重启"提示
- [x] 8.5 页面：每个渠道一个"测试"按钮调用 `POST /test` 并显示结果
- [x] 8.6 页面：展示 `GET /stats` 运行状态与最近请求

## 9. 预置与文档

- [x] 9.1 默认 config 预置 agentrouter（glm-5.1/deepseek-v4-pro，thinkingStyle=deepseek）与 MiMo（thinkingStyle=mimo）示例渠道
- [x] 9.2 README 写入 `~/.codex/config.toml`（wire_api=responses 指向本代理）与 `auth.json` 配置示例
- [x] 9.3 README 标注 MiMo 模型名小写等注意事项

## 10. 验证

- [x] 10.1 编写冒烟脚本：/health、/v1/models、鉴权、非流式、流式、effort 映射、工具调用、多轮续接
- [ ] 10.2 用真实 key 跑通 agentrouter（glm-5.1 与 deepseek-v4-pro）与 MiMo 各一次端到端
- [ ] 10.3 在真实 Codex CLI 中配置并完成一次实际代码编辑任务验证
