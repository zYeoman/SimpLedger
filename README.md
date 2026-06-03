# Local Money

本地优先的个人记账 PWA。数据保存在浏览器 IndexedDB，本项目不需要后端服务。

## 功能

- 收入、支出、转账记录
- 首页流水明细和账户筛选
- 资产统计，支持现金/理财账户属性
- 分类自定义：名称、颜色、图标
- 周期记账：支持收入、支出、转账，以及每天、工作日、休息日、每周、每月、每年重复
- JSON 备份导入/导出
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

导入会替换当前本地数据库中的账目、分类、账户和周期记账规则。

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
