#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

const args = process.argv.slice(2);
let daemon = false;
let stop = false;

function resolveConfigDir() {
  return process.env.CONFIG_DIR || path.join(os.homedir(), ".codex-responses-proxy");
}

function resolveConfigPath(configDir) {
  return process.env.CONFIG_PATH || path.join(configDir, "config.json");
}

function readPort(configPath) {
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    const port = Number(cfg?.port);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  } catch {}
  return 3001;
}

async function checkHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`codex-responses-proxy — Codex Responses API 本地代理

用法:
  codex-responses-proxy [选项]

选项:
  -h, --help         显示帮助
  -v, --version      显示版本
  -c, --config       指定配置文件路径（覆盖默认路径）
  -d, --config-dir   指定配置目录（默认 ~/.codex-responses-proxy）
  --daemon, -daemon  后台启动（日志写入配置目录/proxy.log）
  --stop, -stop      停止后台代理

默认配置:
  ~/.codex-responses-proxy/config.json

环境变量:
  CONFIG_PATH      同 --config
  CONFIG_DIR       同 --config-dir
  LOG_LEVEL        日志级别 (info|debug|warn|error|silent)

示例:
  codex-responses-proxy
  codex-responses-proxy -daemon
  codex-responses-proxy --stop
  codex-responses-proxy --config ~/my-proxy.json
  npm install -g . && codex-responses-proxy -daemon
`);
}

function isDaemonFlag(arg) {
  return arg === "--daemon" || arg === "-daemon";
}

function isStopFlag(arg) {
  return arg === "--stop" || arg === "-stop";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function takesValue(arg) {
  return arg === "-c" || arg === "--config" || arg === "-d" || arg === "--config-dir";
}

function applyOptions(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    }
    if (a === "-v" || a === "--version") {
      console.log(pkg.version);
      process.exit(0);
    }
    if (isDaemonFlag(a)) {
      daemon = true;
      continue;
    }
    if (isStopFlag(a)) {
      stop = true;
      continue;
    }
    if (a === "-c" || a === "--config") {
      const p = argv[++i];
      if (!p) {
        console.error("错误: --config 需要指定路径");
        process.exit(1);
      }
      process.env.CONFIG_PATH = p;
      continue;
    }
    if (a === "-d" || a === "--config-dir") {
      const p = argv[++i];
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
}

function childArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (isDaemonFlag(a) || isStopFlag(a)) continue;
    out.push(a);
    if (takesValue(a)) out.push(argv[++i]);
  }
  return out;
}

function killPid(pid, signal = "SIGTERM") {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    throw err;
  }
}

function killPortListeners(port) {
  if (process.platform === "win32") return;
  try {
    const out = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" }).trim();
    if (!out) return;
    for (const pid of out.split("\n").map((s) => Number.parseInt(s, 10)).filter(Boolean)) {
      killPid(pid);
    }
  } catch (err) {
    if (err.status !== 1) throw err;
  }
}

function removePidFile(pidFile) {
  try {
    if (existsSync(pidFile)) unlinkSync(pidFile);
  } catch {}
}

async function stopProxy() {
  const configDir = resolveConfigDir();
  const pidFile = path.join(configDir, "proxy.pid");
  const port = readPort(resolveConfigPath(configDir));
  const wasRunning = await checkHealth(port);

  if (!wasRunning) {
    removePidFile(pidFile);
    console.log("未在运行");
    process.exit(0);
  }

  try {
    const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    killPid(pid);
  } catch {}

  await sleep(800);

  if (await checkHealth(port)) {
    killPortListeners(port);
    await sleep(500);
  }

  if (await checkHealth(port)) {
    console.error(`停止失败，请手动结束占用 ${port} 端口的进程`);
    process.exit(1);
  }

  removePidFile(pidFile);
  console.log("已停止");
  process.exit(0);
}

async function startDaemon(argv) {
  const configDir = resolveConfigDir();
  const configPath = resolveConfigPath(configDir);
  const logFile = path.join(configDir, "proxy.log");
  const pidFile = path.join(configDir, "proxy.pid");
  const port = readPort(configPath);

  mkdirSync(configDir, { recursive: true });

  if (await checkHealth(port)) {
    console.log(`已在运行: http://127.0.0.1:${port}/`);
    process.exit(0);
  }

  const entryScript = process.argv[1];
  const logFd = openSync(logFile, "a");
  const child = spawn(process.execPath, [entryScript, ...childArgs(argv)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });

  writeFileSync(pidFile, String(child.pid));
  child.unref();

  await new Promise((resolve) => setTimeout(resolve, 800));

  if (await checkHealth(port)) {
    console.log(`后台已启动 · http://127.0.0.1:${port}/`);
    console.log(`日志: ${logFile}`);
    console.log(`PID:  ${child.pid}`);
    process.exit(0);
  }

  console.error(`启动失败，请查看日志: ${logFile}`);
  process.exit(1);
}

applyOptions(args);

if (daemon && stop) {
  console.error("错误: --daemon 与 --stop 不能同时使用");
  process.exit(1);
}

if (stop) {
  await stopProxy();
}

if (daemon) {
  await startDaemon(args);
}

await import("../proxy.mjs");
