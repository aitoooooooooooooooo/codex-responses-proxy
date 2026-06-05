#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
);

const args = process.argv.slice(2);

function printHelp() {
  console.log(`codex-responses-proxy — Codex Responses API 本地代理

用法:
  codex-responses-proxy [选项]

选项:
  -h, --help       显示帮助
  -v, --version    显示版本
  -c, --config     指定配置文件路径（覆盖默认路径）
  -d, --config-dir 指定配置目录（默认 ~/.codex-responses-proxy）

默认配置:
  ~/.codex-responses-proxy/config.json

环境变量:
  CONFIG_PATH      同 --config
  CONFIG_DIR       同 --config-dir
  LOG_LEVEL        日志级别 (info|debug|warn|error|silent)

示例:
  codex-responses-proxy
  codex-responses-proxy --config ~/my-proxy.json
  npm install -g . && codex-responses-proxy
`);
}

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") {
    printHelp();
    process.exit(0);
  }
  if (a === "-v" || a === "--version") {
    console.log(pkg.version);
    process.exit(0);
  }
  if (a === "-c" || a === "--config") {
    const p = args[++i];
    if (!p) {
      console.error("错误: --config 需要指定路径");
      process.exit(1);
    }
    process.env.CONFIG_PATH = p;
    continue;
  }
  if (a === "-d" || a === "--config-dir") {
    const p = args[++i];
    if (!p) {
      console.error("错误: --config-dir 需要指定路径");
      process.exit(1);
    }
    process.env.CONFIG_DIR = p;
    if (!process.env.CONFIG_PATH) {
      process.env.CONFIG_PATH = path.join(p, "config.json");
    }
    continue;
  }
  console.error(`未知选项: ${a}\n运行 codex-responses-proxy --help 查看用法`);
  process.exit(1);
}

await import("../proxy.mjs");
