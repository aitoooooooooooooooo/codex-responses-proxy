## 1. 服务端预设库

- [x] 1.1 在 `proxy.mjs` 定义 `PROVIDER_PRESETS` 常量（agentrouter、MiMo 国内/国际、DeepSeek、智谱 GLM、MiniMax 国内/国际）
- [x] 1.2 `publicConfig()` 返回 `providerPresets`（只读，不持久化到 config.json）
- [x] 1.3 为 agentrouter 预设文档注释说明内置 Roo Code headers 行为

## 2. 控制台 UI

- [x] 2.1 渠道页增加「从模板添加」下拉（数据来自 `cfg.providerPresets`）
- [x] 2.2 选择模板后插入预填渠道卡片（name/baseUrl/thinkingStyle/models）
- [x] 2.3 保留「+ 添加空白渠道」；渠道名冲突时自动去重或提示
- [x] 2.4 模板 label 展示厂商中文名，hover 或副标题显示 baseUrl

## 3. 文档与验证

- [x] 3.1 README「预置渠道」表补充预设模板说明
- [x] 3.2 手动验证：从模板添加 MiMo / DeepSeek 卡片字段正确；保存后路由正常
- [x] 3.3 `GET /config` 冒烟：`providerPresets` 字段存在且含 agentrouter 与 mimo-cn
