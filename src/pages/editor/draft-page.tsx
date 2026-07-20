import { useRef, useState, useEffect, useCallback, Suspense } from 'react';
import {
  Layout,
  Button,
  Avatar,
  Space,
  Input,
  Dropdown,
  message,
  Spin,
} from 'antd';
import {
  MenuOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { EditorContent } from '@tiptap/react';
import AIEditorBubble from '@/components/AIEditorBubble';
import '@/assets/styles/tiptap.scss';
const { Header, Sider, Content } = Layout;

import editor from '@/pages/editor/config/editorConfig-page';
import Toolbar from '../../components/ToolBar/index';
import React from 'react';
import { Toc } from '@/components/Toc/toc-page';
import { useSelector, useDispatch } from 'react-redux';
import { setTocItems } from '@/store/modules/tocSlice';
import CustomLinkBubble from '@/components/LinkBubble';
import AIEditorToolbar from '@/components/AiEditorToolbar';
import EditorPerformanceMonitor from '@/components/EditorPerformanceMonitor';
import {
  generateSmallDocument,
  generateMediumDocument,
  generateLargeDocument,
} from '@/utils/generateTestDocument';
import marked from '@/utils/marked';
import { PagedEditorManager } from '@/pages/editor/managers/PagedEditorManager';
import { DocumentConverter } from '@/pages/editor/utils/DocumentConverter';
import '@/pages/editor/styles/paged-editor.css';

const AISuggestionPreview = React.lazy(
  () => import('@/components/AISuggestionPreview'),
);

const MemorizedToC = React.memo(Toc);

const TiptapEditor = () => {
  const items = useSelector((state: any) => state.toc.tocItems);
  const dispatch = useDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [isLinkBubbleVisible, setIsLinkBubbleVisible] = useState(false);
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // 🔥 分页编辑器相关状态
  const pagedManagerRef = useRef<PagedEditorManager | null>(null);
  const [isPagedMode, setIsPagedMode] = useState(false);
  const [pagedDocId, setPagedDocId] = useState('current-doc');
  const isPagedModeRef = useRef(false); // 使用 ref 跟踪分页模式状态，避免闭包问题
  const normalTocCleanupRef = useRef<(() => void) | null>(null); // 存储普通模式TOC监听器的清理函数

  const handleInsertLink = () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    if (from == to) {
      const linkText = '链接';
      editor
        .chain()
        .focus()
        .insertContent('链接')
        .setTextSelection({ from, to: from + linkText.length })
        .run();
    }
    setIsLinkBubbleVisible(true);
  };

  const handleLinkSubmit = (text: string, url: string) => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const linkText = from !== to ? text : text || '链接';

    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, {
        type: 'text',
        text: linkText,
        marks: [{ type: 'link', attrs: { href: url } }],
      })
      .run();

    setIsLinkBubbleVisible(false);
  };
  // 🔥 转换为分页文档
  const handleConvertToPagedDoc = useCallback(async () => {
    if (!editor) {
      message.warning('编辑器未初始化');
      return;
    }

    const content = editor.getText();
    if (content.length < 3000) {
      message.warning('文档太短（少于3000字），不建议使用分页模式');
      return;
    }

    const loadingMsg = message.loading('正在转换为分页格式...', 0);

    try {
      const startTime = performance.now();

      // 转换文档
      await DocumentConverter.convertToPagedDocument(
        editor,
        pagedDocId,
        '当前文档',
        5000, // 每页 5000 字
      );

      const elapsed = performance.now() - startTime;

      loadingMsg();
      message.success({
        content: `✅ 转换完成，耗时 ${elapsed.toFixed(0)}ms`,
        duration: 3,
      });

      // 获取统计信息
      const stats = await DocumentConverter.getDocumentStats(pagedDocId);
      if (stats) {
        message.info({
          content: `📊 文档已拆分为 ${stats.totalPages} 页，共 ${stats.totalWords} 字，${stats.totalHeadings} 个标题`,
          duration: 5,
        });
      }

      // 提示切换到分页模式
      setTimeout(() => {
        message.info({
          content: '💡 点击"启用分页模式"按钮以使用分页编辑器',
          duration: 5,
        });
      }, 1000);
    } catch (error) {
      loadingMsg();
      console.error('转换失败:', error);
      message.error('转换为分页格式失败');
    }
  }, [editor, pagedDocId]);

  // 🔥 启用分页模式
  const handleEnablePagedMode = useCallback(async () => {
    if (!editor) return;

    const loadingMsg = message.loading('正在启用分页模式...', 0);

    try {
      // 🔥 立即清除普通模式的监听器，防止它继续触发
      if (normalTocCleanupRef.current) {
        console.log('[TiptapEditor] 🛑 强制清除普通模式 TOC 监听器');
        normalTocCleanupRef.current();
        normalTocCleanupRef.current = null;
      }

      // 创建分页管理器
      const manager = new PagedEditorManager(editor, pagedDocId);
      pagedManagerRef.current = manager;

      // 同步更新 ref（必须在初始化前设置，防止任何竞态条件）
      isPagedModeRef.current = true;
      // 设置全局标志，供 editorConfig 中的 TableOfContents 扩展检查
      (window as any).__PAGED_MODE_ACTIVE__ = true;

      // 初始化（加载第一页）
      await manager.init(1);

      setIsPagedMode(true);
      loadingMsg();
      message.success('✅ 分页模式已启用');

      console.log('[TiptapEditor] 分页模式已启用');
    } catch (error) {
      loadingMsg();
      console.error('启用分页模式失败:', error);
      message.error('启用分页模式失败');
    }
  }, [editor, pagedDocId]);

  // 🔥 禁用分页模式
  const handleDisablePagedMode = useCallback(async () => {
    if (!pagedManagerRef.current) return;

    const loadingMsg = message.loading('正在禁用分页模式...', 0);

    try {
      // 销毁分页管理器
      pagedManagerRef.current.destroy();
      pagedManagerRef.current = null;

      // 恢复完整文档
      const fullDoc = await DocumentConverter.convertToFullDocument(pagedDocId);
      editor.commands.setContent(fullDoc);

      setIsPagedMode(false);
      isPagedModeRef.current = false; // 同步更新 ref
      // 清除全局标志
      (window as any).__PAGED_MODE_ACTIVE__ = false;
      loadingMsg();
      message.success('✅ 已恢复为完整文档');

      console.log('[TiptapEditor] 分页模式已禁用');
    } catch (error) {
      loadingMsg();
      console.error('禁用分页模式失败:', error);
      message.error('禁用分页模式失败');
    }
  }, [editor, pagedDocId]);

  // 🔥 加载测试文档
  const loadTestDocument = useCallback(
    (size: 'small' | 'medium' | 'large') => {
      if (!editor) return;

      const startTime = performance.now();
      let markdown = '';

      switch (size) {
        case 'small':
          markdown = generateSmallDocument();
          message.loading('正在加载 3000 字测试文档...', 1);
          break;
        case 'medium':
          markdown = generateMediumDocument();
          message.loading('正在加载 10000 字测试文档...', 2);
          break;
        case 'large':
          markdown = generateLargeDocument();
          message.loading('正在加载 50000 字测试文档...', 3);
          break;
      }

      // 延迟加载以显示 loading
      setTimeout(() => {
        const html = marked.parse(markdown);
        editor.commands.setContent(html);

        const loadTime = performance.now() - startTime;
        message.success(`文档加载完成，耗时 ${loadTime.toFixed(0)}ms`, 2);

        // 自动打开性能监控
        setShowPerformanceMonitor(true);
      }, 100);
    },
    [editor],
  );

  // 🔥 清理分页管理器
  useEffect(() => {
    return () => {
      if (pagedManagerRef.current) {
        console.log('[TiptapEditor] 组件卸载，清理分页管理器');
        pagedManagerRef.current.destroy();
        pagedManagerRef.current = null;
      }
    };
  }, []);

  // 🔥 快捷键监听（Ctrl+Shift+P 切换性能监控）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowPerformanceMonitor((prev) => !prev);
        message.info(
          showPerformanceMonitor ? '性能监控已关闭' : '性能监控已开启',
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPerformanceMonitor]);

  // 分页模式下的目录更新 - 只在模式切换时执行一次
  useEffect(() => {
    if (!editor || !isPagedMode || !pagedManagerRef.current) return;

    console.log('[TOC] 初始化分页模式目录');
    const loadPagedToc = async () => {
      const tocItems = [];
      const totalPages = pagedManagerRef.current!.totalPages;

      // 获取所有页面的目录项（从 IndexedDB 中的索引获取）
      for (let i = 1; i <= totalPages; i++) {
        const pageToc = pagedManagerRef.current!.getTocForPage(i);
        console.log(`[TOC] 第 ${i} 页目录项:`, pageToc?.length || 0);

        if (pageToc && pageToc.length > 0) {
          // 添加页码信息到每个目录项
          const itemsWithPage = pageToc.map((item) => ({
            id: item.id,
            level: item.level,
            textContent: item.text,
            itemIndex: item.posInPage,
            pageNumber: i,
          }));
          tocItems.push(...itemsWithPage);
        }
      }

      console.log(`[TOC] 分页模式总共 ${tocItems.length} 个目录项`);
      dispatch(setTocItems(tocItems));
    };

    // 延迟加载确保索引已完全初始化
    setTimeout(() => {
      loadPagedToc();
    }, 500);
  }, [editor, dispatch, isPagedMode]); // 移除 pagedManagerRef.current 依赖

  // 普通模式下的目录更新 - 监听文档变化
  useEffect(() => {
    // 严格检查：只有在非分页模式下才执行
    if (!editor || isPagedMode || pagedManagerRef.current) {
      normalTocCleanupRef.current = null;
      return;
    }

    console.log('[TOC] 初始化普通模式目录');

    const updateToc = () => {
      // 使用 ref 进行实时检查，避免闭包问题
      if (isPagedModeRef.current || pagedManagerRef.current) {
        console.log('[TOC] 🛑 阻止普通模式更新，当前在分页模式');
        return;
      }

      const headings = Array.from(
        editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6'),
      );

      const tocItems = headings.map((heading, index) => {
        // 确保标题有ID
        if (!heading.id) {
          heading.id = `heading-${Date.now()}-${index}`;
        }
        return {
          id: heading.id,
          level: parseInt(heading.tagName[1]),
          textContent: heading.textContent || '',
          itemIndex: index,
        };
      });

      console.log(`[TOC] 普通模式找到 ${tocItems.length} 个目录项`);
      dispatch(setTocItems(tocItems));
    };

    // 初始更新
    updateToc();

    // 监听文档变化
    editor.on('update', updateToc);

    // 保存清理函数到 ref，以便分页模式启动时立即清除
    const cleanup = () => {
      console.log('[TOC] 清除普通模式监听器');
      editor.off('update', updateToc);
    };
    normalTocCleanupRef.current = cleanup;

    return cleanup;
  }, [editor, dispatch, isPagedMode]);

  return (
    <Layout className="editor-container" style={{ height: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0',
          borderBottom: '1px solid #f0f0f0',
          height: 'auto',
        }}
      >
        <div
          style={{
            padding: '0 24px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ marginRight: 16 }}
            />
            <span style={{ fontSize: '16px', fontWeight: 500 }}>
              <Input
                className="title-input"
                variant="borderless"
                maxLength={20}
                placeholder=" 输入文章标题"
              />
            </span>
          </div>

          <Space>
            {/* 🔥 测试文档加载按钮 */}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'convert-to-paged',
                    label: '📄 转换为分页格式',
                    icon: <DatabaseOutlined />,
                    onClick: handleConvertToPagedDoc,
                    disabled: isPagedMode,
                  },
                  {
                    key: 'enable-paged',
                    label: isPagedMode
                      ? '✅ 分页模式已启用'
                      : '🚀 启用分页模式',
                    icon: <DashboardOutlined />,
                    onClick: handleEnablePagedMode,
                    disabled: isPagedMode,
                  },
                  {
                    key: 'disable-paged',
                    label: '🔙 恢复完整文档',
                    icon: <DashboardOutlined />,
                    onClick: handleDisablePagedMode,
                    disabled: !isPagedMode,
                  },
                  { type: 'divider' },
                  {
                    key: 'small',
                    label: '小文档 (3K字)',
                    icon: <ExperimentOutlined />,
                    onClick: () => loadTestDocument('small'),
                  },
                  {
                    key: 'medium',
                    label: '中等文档 (1万字)',
                    icon: <ExperimentOutlined />,
                    onClick: () => loadTestDocument('medium'),
                  },
                  {
                    key: 'large',
                    label: '大文档 (5万字)',
                    icon: <ExperimentOutlined />,
                    onClick: () => loadTestDocument('large'),
                  },
                  { type: 'divider' },
                  {
                    key: 'monitor',
                    label: showPerformanceMonitor
                      ? '关闭性能监控'
                      : '打开性能监控',
                    icon: <DashboardOutlined />,
                    onClick: () => setShowPerformanceMonitor((prev) => !prev),
                  },
                ],
              }}
              placement="bottomRight"
            >
              <Button type="text" icon={<ExperimentOutlined />}>
                测试工具
              </Button>
            </Dropdown>

            <Button type="text">保存成功</Button>
            <Button type="primary" ghost>
              草稿箱
            </Button>
            <Button type="primary">发布</Button>
            <Avatar
              size="small"
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=1"
            />
          </Space>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 24px',
            width: 'max-content',
            margin: 'auto',
          }}
        >
          <Toolbar handleInsertLink={handleInsertLink} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <AIEditorToolbar editor={editor} />
          </div>
        </div>
      </Header>

      <Layout>
        <Sider
          width={280}
          style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
          collapsed={collapsed}
          collapsedWidth={0}
        >
          <div
            style={{ padding: '16px', overflowY: 'scroll', maxHeight: '60vh' }}
          >
            <div className="sidebar-options">
              <h4 className="label-large">
                目录
                {isPagedMode && pagedManagerRef.current && (
                  <span
                    className="toc-page-info"
                    style={{
                      fontSize: '0.8em',
                      color: '#666',
                      marginLeft: '8px',
                    }}
                  >
                    (当前第 {pagedManagerRef.current.currentPage} 页 / 共{' '}
                    {pagedManagerRef.current.totalPages} 页)
                  </span>
                )}
              </h4>
              <div className="table-of-contents">
                {isPagedMode && pagedManagerRef.current?.isLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spin
                      indicator={
                        <LoadingOutlined style={{ fontSize: 24 }} spin />
                      }
                    />
                    <div style={{ marginTop: '8px' }}>加载目录中...</div>
                  </div>
                ) : (
                  <MemorizedToC
                    editor={editor}
                    items={items}
                    pagedManager={isPagedMode ? pagedManagerRef.current : null}
                  />
                )}
              </div>
            </div>
          </div>
        </Sider>

        <Layout style={{ background: '#fff' }}>
          <Content
            ref={editorContainerRef}
            // style={{
            //   padding: '0',
            //   background: '#fff',
            //   display: 'flex',
            //   width: '100%',
            //   justifyContent: 'center',
            //   overflowY: 'auto',
            // }}
          >
            {/* <div */}
            {/* // ref={editorContainerRef}
              // style={{
              //   width: '100%',
              //   maxWidth: '800px',
              //   padding: '10px 24px',
              //   position: 'relative',
              // }} */}
            {/* > */}
            <div
              id="tiptap"
              style={{
                maxHeight: 'calc(100vh - 150px)',
                padding: '0',
                background: '#fff',
                display: 'flex',
                width: '100%',
                justifyContent: 'center',
                overflowY: 'auto',
              }}
            >
              <EditorContent
                className="tiptap-editor"
                style={{ width: '100%' }}
                editor={editor}
              ></EditorContent>
            </div>
            {/* fim补全 */}
            <AIEditorBubble editor={editor} />
            <Suspense fallback={null}>
              <AISuggestionPreview editor={editor} />
            </Suspense>
            <CustomLinkBubble
              onSubmit={handleLinkSubmit}
              editor={editor}
              isVisible={isLinkBubbleVisible}
              onClose={() => setIsLinkBubbleVisible(false)}
            />

            {/* 🔥 性能监控组件 */}
            <EditorPerformanceMonitor
              editor={editor}
              visible={showPerformanceMonitor}
              position="top-right"
            />
            {/* </div> */}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default TiptapEditor;
