# Codex Responses Proxy — 常用命令（不用记 node 参数）
# 用法: make          查看帮助
#       make start    启动代理

NODE        ?= node
BIN         := bin/codex-responses-proxy.mjs
PORT        ?= 3001
URL         := http://127.0.0.1:$(PORT)
CONFIG_DIR  := $(HOME)/.codex-responses-proxy
CONFIG_PATH := $(CONFIG_DIR)/config.json
LOCAL_CONFIG := $(CURDIR)/config.json
PID_FILE    := $(CONFIG_DIR)/proxy.pid
LOG_FILE    := $(CONFIG_DIR)/proxy.log

.DEFAULT_GOAL := help

.PHONY: help install uninstall pack start dev start-bg stop restart status smoke ui config-path config-edit test-agentrouter test-mimo

help: ## 显示此帮助
	@echo ""
	@echo "  Codex Responses Proxy"
	@echo "  配置目录: $(CONFIG_DIR)"
	@echo "  管理页面: $(URL)/"
	@echo ""
	@echo "  常用命令:"
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "    make %-14s %s\n", $$1, $$2}'
	@echo ""

install: ## 全局安装 CLI（之后任意目录可运行 codex-responses-proxy）
	@command -v node >/dev/null || (echo "请先安装 Node.js 18+: https://nodejs.org"; exit 1)
	npm install -g .

uninstall: ## 卸载全局 CLI
	-npm uninstall -g codex-responses-proxy

pack: ## 打包成 .tgz 安装包（可拷贝到其他机器安装）
	@command -v node >/dev/null || (echo "请先安装 Node.js 18+"; exit 1)
	npm pack
	@echo ""
	@echo "已生成: codex-responses-proxy-*.tgz"
	@echo "在其他机器安装: npm install -g codex-responses-proxy-1.0.0.tgz"

start: ## 前台启动（Ctrl+C 停止，配置用 ~/.codex-responses-proxy/）
	$(NODE) $(BIN)

dev: ## 前台启动，使用项目目录 config.json（开发/调试）
	CONFIG_PATH="$(LOCAL_CONFIG)" $(NODE) $(BIN)

start-bg: ## 后台启动（日志写入 ~/.codex-responses-proxy/proxy.log）
	$(NODE) $(BIN) -daemon

stop: ## 停止后台代理
	$(NODE) $(BIN) --stop

restart: stop start-bg ## 重启后台代理

status: ## 检查代理是否在运行
	@curl -sf "$(URL)/health" | $(NODE) -e " \
		const d=JSON.parse(require('fs').readFileSync(0,'utf8')); \
		console.log('运行中 · 端口', d.port, '· 已运行', d.uptimeSec + 's', '· 渠道', d.providers.join(', '));" \
	|| echo "未运行（执行 make start 或 make start-bg 启动）"

smoke: ## 冒烟测试（需先启动代理）
	LOCAL_KEY=$$( $(NODE) -e " \
		try { \
		  const c=require('$(CONFIG_PATH)'); \
		  const k=(c.localKeys||[])[0]; \
		  process.stdout.write(typeof k==='string'?k:(k&&k.key)||''); \
		} catch { process.stdout.write(''); }" \
	) bash scripts/smoke.sh "$(URL)"

ui: ## 在浏览器打开配置页面
	@open "$(URL)/" 2>/dev/null || xdg-open "$(URL)/" 2>/dev/null || echo "请手动打开: $(URL)/"

config-path: ## 显示配置文件路径
	@echo "$(CONFIG_PATH)"
	@test -f "$(CONFIG_PATH)" && echo "（文件存在）" || echo "（尚未创建，首次 make start 会自动生成）"

config-edit: ## 用编辑器打开配置文件
	@mkdir -p "$(CONFIG_DIR)"
	@test -f "$(CONFIG_PATH)" || cp config.example.json "$(CONFIG_PATH)"
	$${EDITOR:-vi} "$(CONFIG_PATH)"

test-agentrouter: ## 测试 agentrouter 连通性
	@curl -s -X POST "$(URL)/test" -H "Content-Type: application/json" \
		-d '{"provider":{"name":"agentrouter"},"model":"glm-5.1"}' | $(NODE) -m json.tool

test-mimo: ## 测试 MiMo 连通性
	@curl -s -X POST "$(URL)/test" -H "Content-Type: application/json" \
		-d '{"provider":{"name":"mimo"},"model":"mimo-v2.5-pro"}' | $(NODE) -m json.tool
