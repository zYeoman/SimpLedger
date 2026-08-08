# Local Money

本地优先的个人记账 PWA。数据保存在浏览器 IndexedDB，本项目不需要后端服务。

## 功能

- 收入、支出、转账记录
- 首页流水明细和账户筛选
- 资产统计，支持现金/理财账户属性
- 分类自定义：名称、颜色、图标
- 周期记账：支持收入、支出、转账，以及每天、工作日、休息日、每周、每月、每年重复
- JSON 备份导入/导出
- WebDAV 和 Cloudflare R2 备份/恢复
- Elephant Bookkeeping 数据转换脚本
- PWA 安装到主屏幕和离线缓存

## 本地开发

```bash
npm install
npm run dev
```

默认开发服务会监听：

```text
http://localhost:5173
```

同一局域网手机访问时，用电脑局域网 IP 加端口访问，例如：

```text
http://192.168.x.x:5173
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

本地预览构建产物：

```bash
npm run preview
```

## 打包成 Android 应用（Capacitor）

项目已集成 Capacitor，`android/` 目录就是完整的 Android 工程。

### 本地打包

需要本机安装 JDK 21 和 Android SDK（或直接装 Android Studio）。然后：

```bash
npm install
npm run android:apk
```

`android:apk` 使用 `build:native`（`vite build --mode native`）构建，网页部署继续用
`npm run build`，两套产物在编译期就区分开，互不包含对方逻辑。

生成的 debug APK 位于：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

也可以只用 `npm run android:sync` 同步 Web 资源，再用 Android Studio 打开
`android/` 目录（`npm run android:open`）构建或调试。

### GitHub Actions 自动构建

仓库已包含 `.github/workflows/build-apk.yml`，推送到 `main` 分支、打 `v*` 标签
或手动触发时，会在云端自动构建：

- debug APK：总是生成，作为 `app-debug-apk` 工件下载
- release APK + AAB：仅在配置签名密钥后生成，作为 `app-release` 工件下载

要生成签名的 release 包，在仓库 Settings → Secrets and variables → Actions 中配置：

- `KEYSTORE_BASE64`：签名密钥库文件的 base64 内容
- `KEYSTORE_PASSWORD`：密钥库密码
- `KEY_ALIAS`：密钥别名
- `KEY_PASSWORD`：密钥密码

本地生成签名密钥库示例：

```bash
keytool -genkey -v -keystore release.keystore -alias localmoney -keyalg RSA -keysize 2048 -validity 10000
```

密钥库文件（`release.keystore`）已加入 .gitignore，不会被提交。请把密钥库和密码
备份到安全位置——丢失后无法再更新已上架的应用。

然后上传 Google Play 时使用 `app-release.aab`。

### 注意

Capacitor 版本的数据（IndexedDB）和网页 PWA 版本相互独立，换用 App 时可用设置页的
JSON / WebDAV / Cloudflare 备份迁移数据。

App 内不会注册 Service Worker（资源已随 APK 打包，且旧缓存会导致升级后白屏）；网页版
PWA 的 Service Worker 保持原样。

## 部署到 Vercel

Vercel 设置保持 Vite 默认即可：

- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

部署后用手机浏览器打开站点，再添加到主屏幕即可作为 PWA 使用。

## PWA 更新

应用使用缓存优先策略。部署新版本后，已安装到主屏幕的 App 可能仍会显示旧缓存。

在 App 的设置页点击“检查更新”，会：

1. 请求 service worker 更新
2. 清理当前缓存
3. 自动刷新应用

## 优化项

- 手机安装后的启动速度：拆分首屏包，优先懒加载统计页图表、设置页等非首页代码；首页农历/假日信息改为空闲时加载；评估用更轻量的横滑方案替代 Swiper，并减少 antd-mobile 首屏依赖。

## 数据存储

数据保存在当前浏览器/当前 PWA 实例的 IndexedDB 中。

注意：

- 同一个网站在普通浏览器和安装到主屏幕后的 PWA 中，可能存在独立的存储上下文。
- 清理浏览器站点数据、卸载 PWA、切换域名，都可能导致本地数据不可见。
- 重要数据请定期在设置页导出 JSON 备份。

## 数据备份

设置页支持：

- 导出 JSON
- 导入 JSON
- 备份到 WebDAV / 从 WebDAV 恢复
- 备份到 Cloudflare / 从 Cloudflare 恢复

导入会替换当前本地数据库中的账目、分类、账户和周期记账规则。

### Cloudflare R2 备份

Cloudflare 备份通过 Worker 代理访问 R2，避免把 R2 Access Key 暴露在浏览器里。

1. 在 Cloudflare 创建 R2 bucket，例如 `local-money-backup`。
2. 复制 `cloudflare/wrangler.example.toml` 为 `cloudflare/wrangler.toml`。
3. 在 `cloudflare/wrangler.toml` 中确认 `bucket_name` 和 Worker 名称。
4. 设置备份令牌：

```bash
cd cloudflare
wrangler secret put BACKUP_TOKEN
```

5. 部署 Worker：

```bash
cd cloudflare
wrangler deploy
```

6. 在 App 设置页填写：

- Worker 地址，例如 `https://local-money-backup.example.workers.dev`
- 备份令牌，即 `BACKUP_TOKEN`

如果 Worker 配置了 `ALLOWED_ORIGINS`，记得把 `https://localhost` 也加进去（Capacitor
APK 里 WebView 的 Origin），否则 App 内备份会被 CORS 拦截：

```toml
[vars]
ALLOWED_ORIGINS = "https://你的网页域名,https://localhost"
```

Worker 会在 R2 中保存：

- `local-money-latest.json`
- `history/local-money-YYYYMMDDHHmmss.json`

## Elephant 数据转换

仓库包含转换脚本：

```bash
python3 convert_elephant_db.py
```

脚本用于把 Elephant Bookkeeping 的数据库转换成当前 App 可导入的 JSON 格式。转换前请确认输入文件路径和输出文件名符合脚本参数/默认值。

## 常用命令

```bash
npm run dev
npm run build
npm run preview
python3 -m py_compile convert_elephant_db.py
```

## 技术栈

- React
- TypeScript
- Vite
- antd-mobile
- Dexie / IndexedDB
- Recharts
- lucide-react
