import type { BackupPayload } from "./db";
import { fileSafeStamp, todayInputValue } from "./utils";

export type WebdavConfig = {
  url: string;
  username: string;
  password: string;
  autoBackup: boolean;
  lastAutoBackupDate?: string;
};

const webdavConfigStorageKey = "localMoneyWebdavConfig";
const latestBackupFileName = "local-money-latest.json";

export function loadWebdavConfig(): WebdavConfig {
  if (typeof window === "undefined") {
    return { url: "", username: "", password: "", autoBackup: false };
  }
  try {
    const value = window.localStorage.getItem(webdavConfigStorageKey);
    const parsed = value ? JSON.parse(value) : {};
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
      autoBackup: Boolean(parsed.autoBackup),
      lastAutoBackupDate: typeof parsed.lastAutoBackupDate === "string" ? parsed.lastAutoBackupDate : undefined,
    };
  } catch {
    return { url: "", username: "", password: "", autoBackup: false };
  }
}

export function saveWebdavConfig(config: WebdavConfig) {
  window.localStorage.setItem(webdavConfigStorageKey, JSON.stringify(config));
}

export function isWebdavConfigured(config: WebdavConfig) {
  return Boolean(config.url.trim());
}

export function shouldRunAutoWebdavBackup(config: WebdavConfig) {
  return config.autoBackup && isWebdavConfigured(config) && config.lastAutoBackupDate !== todayInputValue();
}

export async function uploadWebdavBackup(config: WebdavConfig, payload: BackupPayload) {
  assertWebdavConfigured(config);
  const body = JSON.stringify(payload, null, 2);
  const historyFileName = `local-money-${fileSafeStamp()}.json`;
  await putWebdavFile(config, historyFileName, body);
  await putWebdavFile(config, latestBackupFileName, body);
}

export async function downloadLatestWebdavBackup(config: WebdavConfig): Promise<BackupPayload> {
  assertWebdavConfigured(config);
  const response = await fetch(webdavFileUrl(config.url, latestBackupFileName), {
    method: "GET",
    headers: webdavAuthHeaders(config),
  });
  if (!response.ok) {
    throw new Error(`读取 WebDAV 备份失败（${response.status}）`);
  }
  return (await response.json()) as BackupPayload;
}

async function putWebdavFile(config: WebdavConfig, fileName: string, body: string) {
  const response = await fetch(webdavFileUrl(config.url, fileName), {
    method: "PUT",
    headers: {
      ...webdavAuthHeaders(config),
      "Content-Type": "application/json",
    },
    body,
  });
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`上传 WebDAV 备份失败（${response.status}）`);
  }
}

function assertWebdavConfigured(config: WebdavConfig) {
  if (!isWebdavConfigured(config)) {
    throw new Error("请先填写 WebDAV 地址");
  }
}

function webdavFileUrl(baseUrl: string, fileName: string) {
  const trimmed = baseUrl.trim();
  const separator = trimmed.endsWith("/") ? "" : "/";
  return `${trimmed}${separator}${encodeURIComponent(fileName)}`;
}

function webdavAuthHeaders(config: WebdavConfig): Record<string, string> {
  if (!config.username) return {};
  return {
    Authorization: `Basic ${window.btoa(`${config.username}:${config.password}`)}`,
  };
}
