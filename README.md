# Codex Responses Proxy

让 **Codex CLI** 通过本地代理，使用 AgentRouter、MiMo、DeepSeek 等模型的本地小工具。

- 安装一次，终端里随时启动
- 自带网页配置界面，填 API Key 即可
- 支持后台运行，不占用命令行窗口

**前提：** 本机已安装 [Node.js 18+](https://nodejs.org)（终端执行 `node -v` 能看到版本号）。

---

## 安装

### 方式一：从 GitHub 安装（推荐）

无需克隆仓库，一条命令全局安装：

```bash
npm install -g github:aitoooooooooooooooo/codex-responses-proxy
```

指定分支或版本（可选）：

```bash
npm install -g github:aitoooooooooooooooo/codex-responses-proxy#main
```

### 方式二：克隆后安装

```bash
git clone https://github.com/aitoooooooooooooooo/codex-responses-proxy.git
cd codex-responses-proxy
npm install -g .
```

### 方式三：离线安装包

在有网络的机器上打包：

```bash
git clone https://github.com/aitoooooooooooooooo/codex-responses-proxy.git
cd codex-responses-proxy
npm pack
# 生成 codex-responses-proxy-1.0.0.tgz
```

把 `.tgz` 拷到目标机器后：

```bash
npm install -g codex-responses-proxy-1.0.0.tgz
```

---

## 卸载

```bash
npm uninstall -g codex-responses-proxy
```

卸载不会删除你的配置，配置文件仍在 `~/.codex-responses-proxy/`。若需彻底清理：

```bash
rm -rf ~/.codex-responses-proxy
```

---

## 启动与停止

安装完成后，在**任意目录**都可以使用：

```bash
codex-responses-proxy              # 前台启动（Ctrl+C 停止）
codex-responses-proxy --daemon     # 后台启动（推荐）
codex-responses-proxy --stop       # 停止后台进程
codex-responses-proxy --help       # 查看帮助
```

后台启动后：

- 管理页面：http://127.0.0.1:3001/
- 日志文件：`~/.codex-responses-proxy/proxy.log`

---

## 首次配置（3 步）

### 1. 启动代理

```bash
codex-responses-proxy --daemon
```

### 2. 打开网页填 Key

浏览器访问 http://127.0.0.1:3001/

1. 进入 **渠道**，填入 AgentRouter / MiMo 等 API Key
2. 点 **测试连通性**，确认通过后 **保存**
3. 进入 **本地 Key**，复制一个 Key（形如 `sk-local-xxx`）

### 3. 配置 Codex

编辑 `~/.codex/config.toml`：

```toml
model = "glm-5.1"
model_provider = "local_proxy"

[model_providers.local_proxy]
name = "local_proxy"
base_url = "http://127.0.0.1:3001/v1"
wire_api = "responses"
requires_openai_auth = true
```

编辑 `~/.codex/auth.json`：

```json
{ "OPENAI_API_KEY": "sk-local-你的本地key" }
```

完成后正常使用 Codex 即可。换模型只需改 `config.toml` 里的 `model`，**无需重启代理**。

> 网页 **接入 Codex** 页可一键生成上述配置片段。

---

## 升级

重新执行安装命令即可覆盖升级：

```bash
npm install -g github:aitoooooooooooooooo/codex-responses-proxy
```

升级后若代理已在后台运行，建议重启：

```bash
codex-responses-proxy --stop
codex-responses-proxy --daemon
```

---

## 常见问题

| 问题 | 答案 |
|------|------|
| 是独立 App 吗？ | 不是，是 Node 命令行工具，运行时需要 Node.js |
| 配置保存在哪？ | `~/.codex-responses-proxy/config.json` |
| 改配置要重装吗？ | 不用，网页保存即生效（改端口需重启） |
| 怎么确认在运行？ | 浏览器打开 http://127.0.0.1:3001/ 或 `curl http://127.0.0.1:3001/health` |
| 支持哪些模型？ | AgentRouter、MiMo、DeepSeek、智谱、MiniMax 等，网页 **渠道** 页可 **从模板添加** |

---

## 开发者

克隆仓库后可用 Make 快捷命令（`make help` 查看全部）：

```bash
make start      # 前台启动
make start-bg   # 后台启动
make stop       # 停止
make smoke      # 冒烟测试
```

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `CONFIG_DIR` | `~/.codex-responses-proxy` | 配置目录 |
| `CONFIG_PATH` | `$CONFIG_DIR/config.json` | 配置文件路径 |
| `LOG_LEVEL` | `info` | 日志级别 |

## License

MIT
