# 分页编辑器实现说明

基于 IndexedDB 与占位符的分页实验。`draft-page.tsx` **已被 `vite.config.ts` 排除出自动路由**，没有默认入口。

正式写作页 `/editor/draft` 接入后端保存与 Agent；分页实验使用独立本地存储。

## 现有实现

### 核心组件

| 组件                                                 | 职责                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| [PageBreak](extensions/PageBreak.ts)                 | 原子边界节点，保存页码、占位状态与高度     |
| [PagedDocStorage](storage/PagedDocStorage.ts)        | IndexedDB 文档元数据、页面 JSON 与目录索引 |
| [TOCIndexManager](managers/TOCIndexManager.ts)       | 独立目录、标题更新与页内位置               |
| [PagedEditorManager](managers/PagedEditorManager.ts) | 可见页切换、占位替换、缓存与脏页保存       |
| [DocumentConverter](utils/DocumentConverter.ts)      | 按顶级节点分块、还原全文、统计与删除       |

### 支持文件

- [分页样式](styles/paged-editor.css)
- [集成示例](examples/paged-editor-usage.tsx)
- [演示组件](draft-page.tsx)
- [设计与使用指南](../../../docs/paged-editor-guide.md)

## 🚀 快速开始

### 1. 转换现有文档为分页格式

```typescript
import { DocumentConverter } from '@/pages/editor/utils/DocumentConverter';

await DocumentConverter.convertToPagedDocument(editor, 'doc-001', '我的文档', 5000);
```

完整 JSON 按顶级节点文本长度划页后存入 IndexedDB。5000 为目标字符数，大节点不再拆分，可能超限。

### 2. 使用分页编辑器

先完成转换，再挂载编辑器；滚动容器须为 `#tiptap`，供管理器绑定监听。

```typescript
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { PageBreak } from '@/pages/editor/extensions/PageBreak';
import { PagedEditorManager } from '@/pages/editor/managers/PagedEditorManager';
import '@/pages/editor/styles/paged-editor.css';

const pagedEditor = new Editor({
  extensions: [StarterKit, PageBreak],
  content: '',
});
const manager = new PagedEditorManager(pagedEditor, 'doc-001');
await manager.init(1);

// 在组件清理时调用。
manager.destroy();
pagedEditor.destroy();
```

`init()` 加载当前及相邻页，其余页使用高度占位符。富文本配置见 `editorConfig-page.ts`。

### 3. 目录跳转

```typescript
const items = manager.getTocForPage(1);
if (items[0]) await manager.scrollToHeading(items[0].id);
```

通过公开方法获取目录；`tocManager` 为私有成员。跳转先加载目标页，找不到标题时定位页顶部。

## 📊 架构对比

### 当前 CSS 虚拟化（已有实现）

默认页使用 `VirtualScroll`、Decoration 与 `content-visibility` 降低屏外渲染开销，ProseMirror 仍保留全文，用于编辑、保存和 Agent 快照。容量取决于内容与设备。

### 分页加载（新实现）

保留页边界占位，按当前页 ± 1 页渲染正文，切换时保存脏页、替换内容并测量高度。需独立目录和全文还原；跨页编辑与正式 Agent 接入待联调。

## 🎯 使用场景建议

| 场景                         | 当前选择                            |
| ---------------------------- | ----------------------------------- |
| 知识文档、文章与 Agent 写作  | 使用正式 `/editor/draft`            |
| 本地长文分页、占位与缓存实验 | 参考 `draft-page.tsx`，自行集成入口 |
| 超长文档性能评估             | 实测加载、滚动、内存与保存          |

## 📁 文件结构

```text
src/pages/editor/
├── draft.tsx                     # 正式写作页
├── draft-page.tsx                # 分页实验组件，排除自动路由
├── config/editorConfig-page.ts   # 分页实验使用的富文本配置
├── extensions/
│   ├── PageBreak.ts              # 页边界与占位节点
│   └── VirtualScroll.ts          # CSS 渲染优化
├── storage/PagedDocStorage.ts    # 浏览器本地存储
├── managers/
│   ├── TOCIndexManager.ts        # 独立目录
│   └── PagedEditorManager.ts     # 页面切换、缓存与保存
├── utils/DocumentConverter.ts    # 分页与全文转换
├── styles/paged-editor.css
├── examples/paged-editor-usage.tsx
└── README-PAGED-EDITOR.md

docs/paged-editor-guide.md         # 设计与使用指南
```

## 🔧 配置选项

### 页面大小

在转换时传入 `pageSize`，默认值位于 `DocumentConverter.ts`：

```typescript
await DocumentConverter.convertToPagedDocument(editor, 'doc-001', '文档', 5000);
```

仅用于初次划页；管理器没有 `PAGE_SIZE_LIMIT`。

### 同时保持的页数

`PagedEditorManager.ts` 的现有常量为：

```typescript
const BUFFER_PAGES = 1; // 当前页及前后各一页
const MAX_CACHED_PAGES = 10; // 页面数据缓存清理阈值
const ESTIMATED_PAGE_HEIGHT = 8000; // 未测量页的预估高度（px）
```

渲染范围与数据缓存不同，选区、脏页和切换状态影响清理。

### 自动保存延迟

`scheduleAutoSave()` 防抖 2000 ms，保存脏页与标题。`destroy()` 发起保存但不等待异步完成；离开前核对结果。本地写入不自动同步后端。

## ⚠️ 关键注意事项

### ✅ 必须做到

- 用 `PageBreak` 标记边界，维护独立目录。
- 替换内容前保存脏页，核对选区。
- 提交全文前用 `DocumentConverter.convertToFullDocument(docId)` 还原。
- 验证滚动、跨页编辑与保存。

### ❌ 绝对不要做

- 将占位 JSON 当作全文上传。
- 从可见正文推导全局目录。
- 将本地写入视为后端保存。
- 将容量设想写成验收结论。

## 🧪 测试步骤

### 1. 转换测试文档

用包含标题、长段落、表格和图片的测试内容，按较小页面划分：

```typescript
await DocumentConverter.convertToPagedDocument(editor, 'test-doc', '测试文档', 3000);
```

### 2. 查看转换结果

```typescript
const stats = await DocumentConverter.getDocumentStats('test-doc');
const fullDoc = await DocumentConverter.convertToFullDocument('test-doc');
console.log(stats, fullDoc);
```

核对页数、标题与还原正文。

### 3. 测试分页编辑器

用 `test-doc` 初始化管理器，依次验证：

1. 滚动切换时真实内容与占位符替换。
2. 编辑后等待自动保存，重新初始化并核对内容。
3. 跨页标题跳转、跨页选区与撤销。
4. 全文还原后表格、图片、公式及标题是否保留。

## 🐛 调试

### 查看控制台日志

按 `[PagedEditor]`、`[DocumentConverter]`、`[TOCIndexManager]` 筛选日志。

### 查看 IndexedDB 数据

开发者工具 → Application → IndexedDB → `PagedDocuments`，检查 `documents / pages / tocIndexes`。数据仅属于当前浏览器来源。

### 开启调试模式

在开发者工具中给 `.page-break-marker` 添加 `data-debug="true"` 查看边界；它是调试 DOM 属性，不是已声明的节点属性。

## 📖 完整文档

[设计指南](../../../docs/paged-editor-guide.md)提供背景；API 与配置以源码为准。

## 🎉 总结

分页方案为独立实验；正式业务接入前需完成全文保存、Agent 快照及跨页编辑联调。
