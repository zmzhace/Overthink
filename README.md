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
- `OverthinkDocumentExtractor` 提供 txt/pdf 本地文本抽取

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
