# 代码审查 TODO

2026-08-12 全库审查结果（Standards + Spec 两轴）。已排除有意设计项。

## P0 — 正确性 bug

- [ ] AI 回复静默丢失：聊天页关闭后 `appendMessage` 落在已卸载组件上（`src/main.tsx:1535-1670`，`handleSend`/`handleRetry`）
- [ ] 导入备份无确认、无 try/catch，且追加式导入会产生重复交易（`src/main.tsx:3886-3892`）
- [ ] WebDAV 备份遇中文用户名 `btoa()` 直接崩溃（`src/webdav.ts:95`）
- [ ] 多处 `setTimeout` 卸载时未清理（`src/main.tsx:1684, 1495, 3676, 554`）
- [x] ~~`chineseNumber` 不支持"二十三"等 20 以上组合~~ — 已通过 AI prompt 强制阿拉伯数字规避（`src/ai.ts:107`）；残留：手动输入中文数字仍无法识别，可给 `chineseNumber` 加 `X十Y` 支持（`src/query.ts:181`）

## P1 — 健壮性/安全小修

- [ ] 备份 URL 校验协议，`http://` 时警告凭证明文传输（`src/webdav.ts` / `src/cloudflare.ts`）
- [ ] WebDAV 两次 PUT 失败时 history/latest 不一致，恢复可能拿到旧备份（`src/webdav.ts:50-51`）
- [ ] Worker：`request.json()` 加 try/catch 返回 400（`cloudflare/backup-worker.js:25`）
- [ ] 删除死条件 `status !== 201 && !== 204`（`src/webdav.ts:75`）
- [ ] AI 空内容重试失败静默吞错，应给用户可区分的提示（`src/ai.ts:150-155`）
- [ ] 分类 effect 依赖 `categories.length` 改为依赖内容（`src/main.tsx:2355, 4473`）
- [ ] 统一 `fileSafeStamp` 两套实现和文件名格式（`cloudflare/backup-worker.js:100` vs `src/utils.ts:53`）

## P2 — 重构（工作量大，可单独立项）

- [ ] 拆分 4903 行 `src/main.tsx`：按视图拆文件（Home/Stats/Settings/AiChat/EntryForm），提 `useHistoryBackedPopup`、`useLongPress` 共享 hooks
- [ ] 消除两大复制粘贴：列表行/详情弹窗（`src/main.tsx:2743-2825` vs `2282-2267`，约 500 行）、WebDAV/Cloudflare 双备份通道（`src/main.tsx:3894-3944, 314-343`）
- [ ] `CategoryIcon` 80 个 `if` 级联改查表（`src/main.tsx:3022-3106`）
- [ ] `localDatePart`/`toDateString` 三处重复收敛到 `src/utils.ts`（`src/db.ts:180`、`src/query.ts:148`）
- [ ] 清理死代码：`useCategories`（`src/main.tsx:2706`）、`RecurringRuleEditor.initialDraft`（`src/main.tsx:4442`）、Dexie version 3/4 重复声明（`src/db.ts:77-121`）
- [ ] `src/query.ts` 中文/阿拉伯数字两套"最近N天/周/月/年"分支合并（`src/query.ts:229-263`）

## P3 — 文档

- [ ] README 补充 AI 助手、主题颜色、"工作日/休息日按法定节假日（含调休）"的说明

## 备注

- 首页账户筛选只影响汇总、明细列表不联动是**有意设计**，不在此列表（`src/main.tsx:384, 640`）。
