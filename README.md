# Local Money

本地优先的个人记账 PWA。数据保存在浏览器 IndexedDB，本项目不需要后端服务。

## 功能

- 收入、支出、转账记录
- 首页流水明细和账户筛选
- 资产统计，支持现金/理财/公积金账户类型
- 公积金账户：建账填当前余额、每月缴存/提取和提取到账账户，每月 28 号自动记账，每年 7/1 提醒手动录入结息
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

打 `v*` 标签且配置签名密钥后，release APK/AAB 还会自动发布到 GitHub Releases；
App 设置页的“检查更新”会检查 GitHub 最新 Release，发现新版本时提供跳转下载链接。

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

## 公积金账户

在设置 → 账户设置里把账户类型改为「公积金」，或新增账户时选择「公积金」。公积金账户计入总资产，也计入资产页的「0 收入能活」可用余额，但不进日常收支统计（统计页单独分组显示缴存/利息/提取）；首页账户筛选 chips 不显示公积金账户，流水明细里公积金账目正常可见。

- 建账：填账户名、**当前余额**、**每月缴存**、**每月提取**、**提取到账账户**。应用按当前余额反推上一个 6/30 的期初余额（期初 = 当前余额 − 将补记的缴存 + 将补记的提取），并创建两条周期记账规则（每月 28 号），立即追平补齐 7/28 至今的账目
- 缴存：周期记账每月 28 号记一笔「公积金缴存」收入；提取：周期转账到建账时指定的到账账户。月缴存/月提取为 0 时不建对应规则
- 余额口径：期初余额 + 起算日（上一个 6/30）之后的流水，起算日及之前的流水不重复计入
- 编辑账户时可改期初余额（纠错用，直接更新不重算）、月缴存/提取额和到账账户（更新对应周期规则；规则被删过且金额大于 0 时从当天起重建，不补历史）；改名级联更新流水/规则/默认分类，删除账户会级联删掉它的两条公积金规则
- 年度结息：每年 7/1 起弹窗提醒，手动输入实际结息金额（记为当年 7/1 的「公积金利息」收入），可同时调整月缴存/提取额；「暂不处理」则下次启动再提醒；落后多年时只处理一次，输入截至上一次 6/30 的累计结息金额即可
- 「公积金缴存」「公积金利息」两个收入分类不存在时会自动创建

### 结息年度

- 结息年度为上年 7 月 1 日至本年 6 月 30 日，每年 6 月 30 日结息，利息 7 月 1 日到账
- App 不自动算利息：实际结息金额以公积金中心到账为准，每年 7/1 提醒手动录入

参考：

- [深圳市住房和建设局：如何计算住房公积金缴存利息](https://zjj.sz.gov.cn/hdjl/ywzs/gjj/content/post_12703906.html)：结息年度、积数计息法、日利率 = 年利率 / 360
- [武汉市人民政府：今起开始发放，你的账户或将多一笔钱](https://www.wuhan.gov.cn/zwgk/tzgg/202607/t20260701_2815460.shtml)：按一年期定期存款基准利率（现行 1.5%）计息，日利率天数 360 天

### 缴存基数

没有可靠的公开 API：

- 缴存基数按职工上一年度月平均工资核定，每年 7 月（新缴存年度开始）由单位向公积金中心申报调整，执行到次年 6 月；上下限由各地公积金中心逐年公布（上限一般为当地上年度职工月平均工资的 3 倍，下限为当地最低工资），缴存比例区间为 5%–12%
- 查询个人基数只能通过当地公积金中心官网/APP、支付宝或微信的城市服务、住建部「全国住房公积金」小程序，全部需要本人实名认证，没有对第三方开放的接口
- 第三方「公积金查询」接口通常要求填入公积金账号密码，多为爬虫抓取，已因侵犯公民个人信息被追究刑事责任（如 2019 年魔蝎科技案），不要用

因此本项目不抓取公积金数据，基数和比例需要自己维护：每年 7 月调整后，按 `月缴存额 = 基数 ×（个人比例 + 单位比例）` 改一下对应的「周期记账」金额即可。

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
