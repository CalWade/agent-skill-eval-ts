/**
 * OpenClaw 模型切换 + Workspace 隔离
 *
 * 模型切换：`openclaw models set` + `openclaw secrets reload` 热切换，无需重启 gateway。
 * Workspace 隔离：每个模型测试前备份 workspace 和 sessions，测后还原，保证模型间完全隔离。
 *
 * 注：openclaw gateway 不支持请求级别的模型指定，只能切换全局默认模型，测试必须串行。
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { cpSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = 'openclaw';

const WORKSPACE_PATH = join(homedir(), '.openclaw', 'workspace');
const SESSIONS_PATH  = join(homedir(), '.openclaw', 'agents', 'main', 'sessions');
const BACKUP_ROOT    = join(tmpdir(), 'openclaw-eval-backup');

function log(msg: string) {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  console.log(`[openclaw][${ts}] ${msg}`);
}

async function runCli(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, { timeout: 30_000 });
  if (stderr) log(`stderr: ${stderr.trim()}`);
  return stdout.trim();
}

/** 读取当前默认模型（用于测试结束后恢复） */
export async function getDefaultModel(): Promise<string> {
  const out = await runCli(['models', 'status', '--json']);
  const data = JSON.parse(out) as { defaultModel?: string };
  return data.defaultModel ?? '';
}

/**
 * 切换默认模型并热重载 gateway。
 * @param providerModelId  格式 "providerId/modelId"
 */
export async function switchModel(providerModelId: string): Promise<void> {
  log(`switching model → ${providerModelId}`);
  await runCli(['models', 'set', providerModelId]);
  await runCli(['secrets', 'reload']);
  log(`model switched to ${providerModelId}`);
}

/**
 * 备份 workspace 和 sessions 到临时目录。
 * 返回备份路径，传给 restoreWorkspace 使用。
 */
export function backupWorkspace(runId: string): string {
  const backupDir = join(BACKUP_ROOT, runId);
  mkdirSync(backupDir, { recursive: true });

  const wsBackup = join(backupDir, 'workspace');
  const ssBackup = join(backupDir, 'sessions');

  if (existsSync(WORKSPACE_PATH)) {
    cpSync(WORKSPACE_PATH, wsBackup, { recursive: true });
    log(`workspace backed up → ${wsBackup}`);
  }
  if (existsSync(SESSIONS_PATH)) {
    cpSync(SESSIONS_PATH, ssBackup, { recursive: true });
    log(`sessions backed up → ${ssBackup}`);
  }

  return backupDir;
}

/**
 * 还原 workspace 和 sessions，并删除备份目录。
 */
export function restoreWorkspace(backupDir: string): void {
  _applyBackup(backupDir);
  rmSync(backupDir, { recursive: true, force: true });
  log(`backup cleaned up: ${backupDir}`);
}

/**
 * 从备份目录还原 workspace/sessions，但不删除备份（可反复还原）。
 */
export function resetFromBackup(backupDir: string): void {
  _applyBackup(backupDir);
  log(`workspace reset from backup`);
}

function _applyBackup(backupDir: string): void {
  const wsBackup = join(backupDir, 'workspace');
  const ssBackup = join(backupDir, 'sessions');

  if (existsSync(wsBackup)) {
    rmSync(WORKSPACE_PATH, { recursive: true, force: true });
    cpSync(wsBackup, WORKSPACE_PATH, { recursive: true });
    log(`workspace restored ← ${wsBackup}`);
  }
  if (existsSync(ssBackup)) {
    rmSync(SESSIONS_PATH, { recursive: true, force: true });
    cpSync(ssBackup, SESSIONS_PATH, { recursive: true });
    log(`sessions restored ← ${ssBackup}`);
  }
}
