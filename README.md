# Overthink Electron 浏览器

这是一个基于 Electron、Chromium 和 React 的 Overthink AI 浏览器原型。

## 当前范围

- Electron + Vite + React 独立项目
- Chromium `WebContentsView` 多标签页管理，由 `OverthinkTabs` 持有
- `overthink://home` 新标签页
- 主窗口左侧网页 + 右侧 Overthink 侧栏
- `OverthinkStorage` 提供本地与会话存储
- `OverthinkPageRuntime` 提供页面摘要、frame 文本与页面脚本执行
- `OverthinkDebugger` 提供 CDP 点击、输入、滚动、键盘和截图支撑
- `OverthinkModelService` 提供 OpenAI-compatible 模型配置、连接测试和流式 Think Chat
- `OverthinkAgentRuntime` 提供可恢复任务、模型规划、低风险自动执行和高风险审批
- `OverthinkResearchRuntime` 提供搜索 API + 浏览器搜索回退、来源抓取和可溯源 Deep Dive
- `OverthinkDocumentExtractor` 提供 txt/pdf 本地文本抽取和 vision model OCR
- `OverthinkExtensionService` 提供本地 unpacked MV3 扩展加载、启停和卸载
- Recall 会自动进入 Think Chat、Agent 和 Deep Dive 上下文
- 导入导出 schema v2 覆盖模型、聊天、Recall、Deep Dive、任务和扩展元数据

## 本地开发

```bash
pnpm install
pnpm run dev
```

## 验证

```bash
pnpm run build
timeout 15s xvfb-run -a pnpm run dev
```
