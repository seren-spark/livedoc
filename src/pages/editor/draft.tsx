import { useRef, useState, useEffect, useCallback, Suspense } from 'react';
import {
  Layout,
  Button,
  Avatar,
  Space,
  Input,
  Dropdown,
  message,
  Alert,
} from 'antd';
import {
  MenuOutlined,
  ExperimentOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { EditorContent } from '@tiptap/react';
import AIEditorBubble from '@/components/AIEditorBubble';
import '@/assets/styles/tiptap.scss';
const { Header, Sider, Content } = Layout;

import editor from '@/pages/editor/config/editorConfig';
import Toolbar from '../../components/ToolBar/index';
import React from 'react';
import { Toc } from '@/components/Toc';
import { useSelector } from 'react-redux';
import CustomLinkBubble from '@/components/LinkBubble';
import AIEditorToolbar from '@/components/AiEditorToolbar';
import EditorPerformanceMonitor from '@/components/EditorPerformanceMonitor';
import {
  generateSmallDocument,
  generateMediumDocument,
  generateLargeDocument,
} from '@/utils/generateTestDocument';
import marked from '@/utils/marked';
import DocumentAgentPanel from '@/components/Knowledge/DocumentAgentPanel';
import type { DocumentIdentity } from '@/api/document-agent.types';
import { useAuth } from '@/contexts/authContext';
import { useKnowledgeDocumentSession } from '@/hooks/useKnowledgeDocumentSession';
import { useArticleSession } from '@/hooks/useArticleSession';
import ArticlePublishPanel from '@/components/ArticlePublishPanel';

const AISuggestionPreview = React.lazy(
  () => import('@/components/AISuggestionPreview'),
);

const MemorizedToC = React.memo(Toc);

const TiptapEditor = () => {
  const { requireAuth } = useAuth();
  const items = useSelector((state: any) => state.toc.tocItems);
  const [collapsed, setCollapsed] = useState(false);
  //组件挂载后立即调用
  const knowledgeSession = useKnowledgeDocumentSession(editor);
  const articleSession = useArticleSession(
    editor,
    !knowledgeSession.isKnowledgeMode,
  );
  const title = knowledgeSession.isKnowledgeMode
    ? knowledgeSession.title
    : articleSession.draft.title;
  const setTitle = knowledgeSession.isKnowledgeMode
    ? knowledgeSession.setTitle
    : (value: string) => articleSession.change({ title: value });
  const [publishOpen, setPublishOpen] = useState(false);
  const [ragChatOpen, setRagChatOpen] = useState(false);
  const agentLocalId = useRef(crypto.randomUUID());
  const agentIdentity: DocumentIdentity = knowledgeSession.isKnowledgeMode
    ? knowledgeSession.documentRecord
      ? {kind:'knowledge',doc_id:knowledgeSession.documentRecord.doc_id,persisted_version:knowledgeSession.documentRecord.document_version}
      : knowledgeSession.importRecord
        ? {kind:'import',import_id:knowledgeSession.importRecord.import_id}
        : {kind:'unsaved',local_id:`knowledge:${agentLocalId.current}`}
    : articleSession.record
      ? {kind:'article',article_id:articleSession.record.article_id,draft_version:articleSession.record.draft_version}
      : {kind:'unsaved',local_id:`article:${agentLocalId.current}`};
  const [isLinkBubbleVisible, setIsLinkBubbleVisible] = useState(false);
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handleRagShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setRagChatOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handleRagShortcut);
    return () => window.removeEventListener('keydown', handleRagShortcut);
  }, []);

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
        <div className="editor-header-row">
          <div className="editor-header-title">
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ marginRight: 16 }}
            />
            <Input.TextArea
              className="title-input"
              aria-label="文档标题"
              variant="borderless"
              autoSize={{ minRows: 1 }}
              maxLength={120}
              disabled={
                !knowledgeSession.isKnowledgeMode &&
                articleSession.saveState === 'loading'
              }
              placeholder=" 输入文章标题"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value.replace(/[\r\n]+/g, ' '))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
            />
          </div>

          <Space className="editor-header-actions" wrap>
            {/* 🔥 测试文档加载按钮 */}
            <Dropdown
              popupRender={() => (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    boxShadow:
                      '0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08)',
                    padding: 8,
                    minWidth: 280,
                  }}
                >
                  <div
                    style={{
                      borderTop: '1px solid #f0f0f0',
                      paddingTop: 8,
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 12px',
                        fontSize: 12,
                        color: '#999',
                      }}
                    >
                      测试文档
                    </div>
                    <Button
                      type="text"
                      block
                      icon={<ExperimentOutlined />}
                      onClick={() => loadTestDocument('small')}
                      style={{
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                      }}
                    >
                      小文档 (3K字)
                    </Button>
                    <Button
                      type="text"
                      block
                      icon={<ExperimentOutlined />}
                      onClick={() => loadTestDocument('medium')}
                      style={{
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                      }}
                    >
                      中等文档 (1万字)
                    </Button>
                    <Button
                      type="text"
                      block
                      icon={<ExperimentOutlined />}
                      onClick={() => loadTestDocument('large')}
                      style={{
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                      }}
                    >
                      大文档 (5万字)
                    </Button>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid #f0f0f0',
                      paddingTop: 8,
                      marginTop: 8,
                    }}
                  >
                    <Button
                      type="text"
                      block
                      icon={<DashboardOutlined />}
                      onClick={() => setShowPerformanceMonitor((prev) => !prev)}
                      style={{
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                      }}
                    >
                      {showPerformanceMonitor ? '关闭性能监控' : '打开性能监控'}
                    </Button>
                  </div>
                </div>
              )}
              placement="bottomRight"
            >
              <Button type="text" icon={<ExperimentOutlined />}>
                测试工具
              </Button>
            </Dropdown>

            <Button
              type="text"
              loading={
                (knowledgeSession.isKnowledgeMode
                  ? knowledgeSession.saveState
                  : articleSession.saveState) === 'saving'
              }
              danger={
                (knowledgeSession.isKnowledgeMode
                  ? knowledgeSession.saveState
                  : articleSession.saveState) === 'error'
              }
            >
              {knowledgeSession.isKnowledgeMode
                ? knowledgeSession.statusText
                : articleSession.statusText}
            </Button>
            {!knowledgeSession.isKnowledgeMode && (
              <Button
                onClick={articleSession.requestSave}
                disabled={articleSession.saveState === 'loading'}
                loading={articleSession.saveState === 'saving'}
              >
                保存草稿
              </Button>
            )}
            <Button
              type="primary"
              ghost
              onClick={() => {
                if (!knowledgeSession.isKnowledgeMode) {
                  articleSession.leave();
                  return;
                }
                if (knowledgeSession.importRecord) {
                  void knowledgeSession.saveDraft();
                } else {
                  knowledgeSession.leave();
                }
              }}
            >
              {knowledgeSession.isKnowledgeMode
                ? knowledgeSession.importRecord
                  ? '保存预览'
                  : '返回知识库'
                : '草稿箱'}
            </Button>
            <Button
              type="primary"
              onClick={() => {
                if (knowledgeSession.isKnowledgeMode) {
                  void knowledgeSession.saveToKnowledge();
                } else requireAuth(() => setPublishOpen(true));
              }}
              loading={
                (knowledgeSession.isKnowledgeMode
                  ? knowledgeSession.saveState
                  : articleSession.saveState) === 'saving'
              }
              disabled={
                !knowledgeSession.isKnowledgeMode &&
                articleSession.saveState === 'loading'
              }
            >
              {knowledgeSession.isKnowledgeMode
                ? knowledgeSession.importRecord
                  ? '确认入库'
                  : knowledgeSession.documentRecord
                    ? '保存并索引'
                    : '保存到知识库'
                : articleSession.record?.state === 'published'
                  ? '更新发布'
                  : '发布'}
            </Button>
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
            <AIEditorToolbar
              editor={editor}
              onOpenRag={() => setRagChatOpen(true)}
            />
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
              <h4 className="label-large">目录</h4>
              <div className="table-of-contents">
                <MemorizedToC editor={editor} items={items} />
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
            {!knowledgeSession.isKnowledgeMode && articleSession.error && (
              <Alert
                showIcon
                type="error"
                message={articleSession.error}
                style={{ margin: '12px 24px' }}
              />
            )}
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
      <DocumentAgentPanel
        editor={editor}
        title={title}
        identity={agentIdentity}
        open={ragChatOpen}
        onClose={() => setRagChatOpen(false)}
        onRequireLogin={requireAuth}
      />
      {!knowledgeSession.isKnowledgeMode && (
        <ArticlePublishPanel
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          session={articleSession}
        />
      )}
    </Layout>
  );
};

export default TiptapEditor;
