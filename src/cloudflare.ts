import type { BackupPayload } from "./db";

export type CloudflareBackupConfig = {
  endpoint: string;
  token: string;
  autoBackup: boolean;
  lastAutoBackupDate?: string;
};

const cloudflareConfigStorageKey = "localMoneyCloudflareBackupConfig";

export function loadCloudflareBackupConfig(): CloudflareBackupConfig {
  if (typeof window === "undefined") {
    return { endpoint: "", token: "", autoBackup: false };
  }
  try {
    const value = window.localStorage.getItem(cloudflareConfigStorageKey);
    const parsed = value ? JSON.parse(value) : {};
    return {
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : "",
      token: typeof parsed.token === "string" ? parsed.token : "",
      autoBackup: Boolean(parsed.autoBackup),
      lastAutoBackupDate: typeof parsed.lastAutoBackupDate === "string" ? parsed.lastAutoBackupDate : undefined,
    };
  } catch {
    return { endpoint: "", token: "", autoBackup: false };
  }
}

export function saveCloudflareBackupConfig(config: CloudflareBackupConfig) {
  window.localStorage.setItem(cloudflareConfigStorageKey, JSON.stringify(config));
}

export function isCloudflareBackupConfigured(config: CloudflareBackupConfig) {
  return Boolean(config.endpoint.trim() && config.token.trim());
}

export function shouldRunAutoCloudflareBackup(config: CloudflareBackupConfig, today: string) {
  return config.autoBackup && isCloudflareBackupConfigured(config) && config.lastAutoBackupDate !== today;
}

export async function uploadCloudflareBackup(config: CloudflareBackupConfig, payload: BackupPayload) {
  assertCloudflareBackupConfigured(config);
  const response = await fetch(cloudflareBackupUrl(config.endpoint, "/backup"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`上传 Cloudflare 备份失败（${response.status}）`);
  }
}

export async function downloadLatestCloudflareBackup(config: CloudflareBackupConfig): Promise<BackupPayload> {
  assertCloudflareBackupConfigured(config);
  const response = await fetch(cloudflareBackupUrl(config.endpoint, "/backup/latest"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`读取 Cloudflare 备份失败（${response.status}）`);
  }
  return (await response.json()) as BackupPayload;
}

function assertCloudflareBackupConfigured(config: CloudflareBackupConfig) {
  if (!config.endpoint.trim()) {
    throw new Error("请先填写 Cloudflare Worker 地址");
  }
  if (!config.token.trim()) {
    throw new Error("请先填写 Cloudflare 备份令牌");
  }
}

function cloudflareBackupUrl(endpoint: string, path: string) {
  return `${endpoint.trim().replace(/\/+$/, "")}${path}`;
}
