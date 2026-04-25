# Overthink AI Browser Implementation

## 当前实现

本次实现把 Overthink 从可运行原型推进到本地完整首版，核心能力包括：

- AI Agent：支持任务持久化、模型规划、工具调用日志、低风险动作自动执行、高风险动作审批。
- Deep Dive：支持搜索 API provider、浏览器搜索回退、网页来源抓取、引用来源记录和结构化研究报告。
- Recall：本地记忆会自动进入 Think Chat、Agent 和 Deep Dive 上下文。
- Documents：支持文本文件、普通 PDF 文本抽取，以及基于 vision model 的图片/扫描 PDF OCR。
- Extensions：支持本地 unpacked MV3 扩展安装、启用、禁用和卸载。
- Data：导入导出升级到 schema v2，覆盖 models、chats、recall、deep dive、tasks 和 extensions metadata。

## 配置方式

在 Overthink 侧栏的 Models 页面配置模型：

- Chat model：OpenAI-compatible `/chat/completions` endpoint。
- Vision model：用于截图理解和 OCR。
- Search provider：支持 Brave、Tavily、SerpAPI 和 generic provider 风格配置。

如果搜索 API 不可用，Deep Dive 会回退到浏览器搜索页面并抓取结果链接。OCR 需要已配置 vision model；没有 vision model 时会保留文档并显示 warning。

## 主要入口

- `src/main/overthink-agent-runtime.ts`：Agent 任务、审批和工具执行。
- `src/main/overthink-research-runtime.ts`：搜索、抓取、来源和 Deep Dive 报告。
- `src/main/overthink-extension-service.ts`：MV3 unpacked 扩展管理。
- `src/main/overthink-model-service.ts`：模型调用、vision OCR、Recall 注入和搜索 provider。
- `src/renderer/sidepanel/OverthinkSidePanel.tsx`：Chat、Agent、Deep Dive、Tasks、Extensions、Models 和 Data UI。

## 验证

```bash
pnpm run build
```

已通过 TypeScript 检查和 Electron/Vite 构建。

## 已知边界

- Chrome 扩展兼容范围为主流 MV3 unpacked 扩展，不承诺 Chrome Web Store、CRX 安装或所有私有 Chrome API 完整等价。
- 任务系统是前台可恢复模式，应用关闭后可保留任务记录，但不会在后台独立运行。
- 数据默认本地保存，schema 预留同步字段，但当前未实现云账号同步。
