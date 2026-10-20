import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  message,
} from 'antd';
import {
  FolderPlus,
  Folder,
  Files,
  Inbox,
  Import,
  MoreHorizontal,
  Recycle,
  BookCopy,
  ArrowUpRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  categoryMutation,
  deleteTemplate,
  getCategoryTree,
  getTemplates,
  getTrash,
  saveTemplate,
  trashMutation,
  type CategoryTree,
  type NoteCategory,
  type NoteTemplate,
} from '@/api/workspace';
import { getKnowledgeDocument } from '@/api/rag';
import './WorkspaceNavigation.scss';
interface Props {
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
  refreshKey: string;
}
export default function WorkspaceNavigation({
  selected,
  onSelect,
  onChanged,
  refreshKey,
}: Props) {
  const navigate = useNavigate();
  const [tree, setTree] = useState<CategoryTree>({
    revision: 0,
    items: [],
    counts: {},
  });
  const [error, setError] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashType, setTrashType] = useState<'document' | 'category'>(
    'document',
  );
  const [trash, setTrash] = useState<any>({ revision: 0, items: [] });
  const [checked, setChecked] = useState<string[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<NoteTemplate> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setTree(await getCategoryTree());
      setError('');
    } catch (error: any) {
      setError(error.response?.data?.message ?? '分类加载失败');
    }
  };
  useEffect(() => {
    void load();
  }, [refreshKey]);
  const perform = async (
    path: string,
    input: Record<string, unknown>,
    method: 'post' | 'patch' = 'post',
  ) => {
    setBusy(true);
    try {
      await categoryMutation(
        path,
        { ...input, expected_tree_revision: tree.revision },
        method,
      );
      await load();
      onChanged();
    } catch (error: any) {
      message.error(error.response?.data?.message ?? error.message);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const create = (parent: string | null) => {
    let name = '';
    Modal.confirm({
      title: parent ? '新建子分类' : '新建分类',
      content: (
        <Input
          autoFocus
          maxLength={100}
          placeholder="分类名称"
          onChange={(e) => {
            name = e.target.value;
          }}
        />
      ),
      onOk: () => perform('', { name, parent_id: parent }),
    });
  };
  const rename = (c: NoteCategory) => {
    let name = c.name;
    Modal.confirm({
      title: '重命名分类',
      content: (
        <Input
          autoFocus
          defaultValue={name}
          maxLength={100}
          onChange={(e) => {
            name = e.target.value;
          }}
        />
      ),
      onOk: () => perform(`/${c.category_id}`, { name }, 'patch'),
    });
  };
  const moveOrMerge = (c: NoteCategory, merge: boolean) => {
    let target: string | null = null;
    Modal.confirm({
      title: merge ? '合并分类' : '移动分类',
      content: (
        <div>
          <p>
            {merge
              ? '文档与子分类将移入目标，同名子分类合并。恢复源分类不会撤销合并。'
              : '移动整个子树，最多三级。'}
          </p>
          <Select
            style={{ width: '100%' }}
            placeholder="选择目标"
            options={[
              ...(!merge ? [{ value: 'root', label: '根目录' }] : []),
              ...tree.items
                .filter((n) => n.category_id !== c.category_id)
                .map((n) => ({ value: n.category_id, label: n.name })),
            ]}
            onChange={(id) => {
              target = id === 'root' ? null : id;
            }}
          />
        </div>
      ),
      onOk: () =>
        perform(
          `/${c.category_id}/${merge ? 'merge' : 'move'}`,
          merge ? { target_id: target } : { parent_id: target },
        ),
    });
  };
  const remove = (c: NoteCategory) => {
    let include = false;
    Modal.confirm({
      title: `回收「${c.name}」及子分类`,
      content: (
        <div>
          <p>默认将文档移到未分类。此前单独回收的文档保持原状态。</p>
          <Checkbox
            onChange={(e) => {
              include = e.target.checked;
            }}
          >
            同时回收其中的文档
          </Checkbox>
        </div>
      ),
      okText: '移入回收站',
      onOk: async () => {
        await perform(`/${c.category_id}/trash`, {
          include_documents: include,
        });
        onSelect(null);
      },
    });
  };
  const node = (c: NoteCategory): any => ({
    key: c.category_id,
    title: (
      <div className="workspace-tree-title">
        <span>{c.name}</span>
        <small>{tree.counts[c.category_id] ?? 0}</small>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'add', label: '新增子分类' },
              { key: 'rename', label: '重命名' },
              { key: 'move', label: '移动' },
              { key: 'merge', label: '合并' },
              { key: 'trash', label: '移入回收站', danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'add') create(c.category_id);
              else if (key === 'rename') rename(c);
              else if (key === 'move') moveOrMerge(c, false);
              else if (key === 'merge') moveOrMerge(c, true);
              else remove(c);
            },
          }}
        >
          <Button
            type="text"
            size="small"
            aria-label={`${c.name} 操作`}
            icon={<MoreHorizontal size={14} />}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    ),
    children: tree.items
      .filter((n) => n.parent_id === c.category_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(node),
  });
  const onDrop = async (info: any) => {
    const dragged = tree.items.find(
      (c) => c.category_id === String(info.dragNode.key),
    );
    const target = tree.items.find(
      (c) => c.category_id === String(info.node.key),
    );
    if (!dragged || !target) return;
    if (!info.dropToGap) {
      await perform(`/${dragged.category_id}/move`, {
        parent_id: target.category_id,
      });
      return;
    }
    if (dragged.parent_id !== target.parent_id) {
      const pos = info.dropPosition - Number(info.node.pos.split('-').at(-1));
      await perform(`/${dragged.category_id}/move`, {
        parent_id: target.parent_id,
        position_id: target.category_id,
        after: pos > 0,
      });
      return;
    }
    const siblings = tree.items
      .filter((c) => c.parent_id === target.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => c.category_id)
      .filter((id) => id !== dragged.category_id);
    const pos = info.dropPosition - Number(info.node.pos.split('-').at(-1));
    const index = siblings.indexOf(target.category_id) + (pos > 0 ? 1 : 0);
    siblings.splice(index, 0, dragged.category_id);
    await perform('/reorder', { parent_id: target.parent_id, ids: siblings });
  };
  const loadTrash = async (type = trashType) => {
    try {
      setTrash(await getTrash(type));
      setChecked([]);
    } catch (error: any) {
      message.error(error.message);
    }
  };
  useEffect(() => {
    if (trashOpen) void loadTrash();
  }, [trashOpen, trashType]);
  const handleTrash = async (
    action: 'restore' | 'purge',
    ids: string[],
    include = false,
    names: Record<string, string> = {},
  ) => {
    setBusy(true);
    try {
      await trashMutation(action, {
        type: trashType,
        ids,
        include_documents: include,
        names,
        expected_tree_revision: trash.revision,
      });
      await loadTrash();
      await load();
      onChanged();
    } catch (error: any) {
      const body = error.response?.data;
      if (action === 'restore' && body?.code === 'CATEGORY_NAME_CONFLICT') {
        let name = '';
        Modal.confirm({
          title: '恢复分类名称冲突',
          content: (
            <Input
              placeholder="新的分类名称"
              onChange={(e) => {
                name = e.target.value;
              }}
            />
          ),
          onOk: () =>
            handleTrash(action, ids, include, {
              ...names,
              [body.category_id]: name,
            }),
        });
      } else message.error(body?.message ?? error.message);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const confirmTrash = (action: 'restore' | 'purge', ids: string[]) => {
    if (!ids.length) return;
    let include = false;
    Modal.confirm({
      title:
        action === 'purge'
          ? `彻底删除 ${ids.length} 项`
          : `恢复 ${ids.length} 项`,
      content:
        action === 'purge' ? (
          <p>
            {trashType === 'category'
              ? '所选分类及全部子分类会彻底删除，回收文档保留，以后恢复到未分类。'
              : '正文、向量、附件与记忆将彻底清理。此操作不能撤销。'}
          </p>
        ) : (
          <div>
            <p>恢复所需祖先分类；不会恢复无关兄弟分支。</p>
            {trashType === 'category' && (
              <Checkbox
                onChange={(e) => {
                  include = e.target.checked;
                }}
              >
                同时恢复本次删除批次的文档
              </Checkbox>
            )}
          </div>
        ),
      okText: action === 'purge' ? '彻底删除' : '恢复',
      okButtonProps: { danger: action === 'purge' },
      onOk: () => handleTrash(action, ids, include),
    });
  };
  const loadTemplates = async () => {
    try {
      setTemplates(await getTemplates());
    } catch (error: any) {
      message.error(error.message);
    }
  };
  useEffect(() => {
    if (templatesOpen) void loadTemplates();
  }, [templatesOpen]);
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saveTemplate(
        { ...editing, expected_revision: editing.revision },
        editing.template_id,
      );
      setEditing(null);
      await loadTemplates();
      message.success('模板已保存');
    } catch (error: any) {
      message.error(error.response?.data?.message ?? error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="workspace-navigation">
      <div className="workspace-nav-heading">
        <strong>个人分类</strong>
        <Button
          type="text"
          size="small"
          aria-label="新增分类"
          icon={<FolderPlus size={16} />}
          onClick={() => create(null)}
          disabled={busy}
        />
      </div>
      {error && (
        <p className="workspace-error">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <button
        type="button"
        aria-current={selected === null ? 'page' : undefined}
        className={
          selected === null ? 'workspace-system active' : 'workspace-system'
        }
        onClick={() => onSelect(null)}
      >
        <Files size={16} />
        全部文档
      </button>
      <button
        type="button"
        aria-current={selected === '__uncategorized__' ? 'page' : undefined}
        className={
          selected === '__uncategorized__'
            ? 'workspace-system active'
            : 'workspace-system'
        }
        onClick={() => onSelect('__uncategorized__')}
      >
        <Inbox size={16} />
        未分类
      </button>
      <Tree
        blockNode
        showIcon
        icon={<Folder size={16} />}
        draggable={!busy}
        defaultExpandAll
        treeData={tree.items
          .filter((c) => !c.parent_id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(node)}
        selectedKeys={selected ? [selected] : []}
        onSelect={(keys) => onSelect(keys.length ? String(keys[0]) : null)}
        onDrop={onDrop}
      />
      {!tree.items.length && !error && (
        <p className="workspace-hint">拖拽整理分类，最多三级。</p>
      )}
      <Space
        direction="vertical"
        className="workspace-utilities"
        style={{ width: '100%' }}
      >
        <Button
          block
          type="text"
          icon={<BookCopy size={16} />}
          onClick={() => setTemplatesOpen(true)}
        >
          笔记模板
        </Button>
        <Button
          block
          type="text"
          icon={<Recycle size={16} />}
          onClick={() => setTrashOpen(true)}
        >
          回收站
        </Button>
        <Button
          block
          type="text"
          icon={<Import size={16} />}
          onClick={() =>
            Modal.confirm({
              title: '迁移旧目录',
              content: '将仍未分配分类的文档按第一个标签归类；不覆盖已有分类。',
              onOk: async () => {
                await categoryMutation('/backfill', {});
                await load();
                onChanged();
              },
            })
          }
        >
          导入旧标签目录
        </Button>
      </Space>
      <Modal
        open={trashOpen}
        onCancel={() => setTrashOpen(false)}
        footer={null}
        title="回收站"
        width={850}
      >
        <Tabs
          activeKey={trashType}
          onChange={(key) => setTrashType(key as any)}
          items={[
            { key: 'document', label: '文档' },
            { key: 'category', label: '分类' },
          ]}
        />
        <Space style={{ marginBottom: 12 }}>
          <Button
            disabled={!checked.length || busy}
            onClick={() => confirmTrash('restore', checked)}
          >
            恢复所选
          </Button>
          <Button
            danger
            disabled={!checked.length || busy}
            onClick={() => confirmTrash('purge', checked)}
          >
            彻底删除所选
          </Button>
        </Space>
        <Table<any>
          size="small"
          rowKey={(row) => row.doc_id ?? row.category_id}
          dataSource={trash.items}
          rowSelection={{
            selectedRowKeys: checked,
            onChange: (ids) => setChecked(ids.map(String)),
          }}
          columns={[
            { title: '名称', render: (_, row) => row.title ?? row.name },
            {
              title: '回收时间',
              dataIndex: 'deleted_at',
              render: (value) => String(value).slice(0, 16),
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  {row.doc_id && (
                    <Button
                      size="small"
                      onClick={() =>
                        void getKnowledgeDocument(row.doc_id)
                          .then((d) =>
                            Modal.info({
                              title: d.title,
                              content: <pre>{d.content}</pre>,
                            }),
                          )
                          .catch(() =>
                            Modal.info({
                              title: row.title,
                              content: (
                                <pre
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: '50vh',
                                    overflow: 'auto',
                                  }}
                                >
                                  {row.content}
                                </pre>
                              ),
                            }),
                          )
                      }
                    >
                      预览
                    </Button>
                  )}
                  <Button
                    size="small"
                    onClick={() =>
                      confirmTrash('restore', [row.doc_id ?? row.category_id])
                    }
                  >
                    恢复
                  </Button>
                  <Button
                    danger
                    size="small"
                    onClick={() =>
                      confirmTrash('purge', [row.doc_id ?? row.category_id])
                    }
                  >
                    彻底删除
                  </Button>
                </Space>
              ),
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
      <Modal
        open={templatesOpen}
        onCancel={() => {
          setTemplatesOpen(false);
          setEditing(null);
        }}
        footer={null}
        title="笔记模板"
        width={800}
      >
        {editing ? (
          <div className="workspace-template-editor">
            <Input
              value={editing.name}
              placeholder="模板名称"
              maxLength={100}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Input
              value={editing.description}
              placeholder="用途说明"
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
            <Input.TextArea
              rows={12}
              value={editing.markdown}
              placeholder="Markdown 章节结构"
              onChange={(e) =>
                setEditing({ ...editing, markdown: e.target.value })
              }
            />
            <Input.TextArea
              rows={3}
              value={editing.instructions}
              placeholder="写作要求"
              onChange={(e) =>
                setEditing({ ...editing, instructions: e.target.value })
              }
            />
            <Space>
              <Button type="primary" loading={busy} onClick={() => void save()}>
                保存模板
              </Button>
              <Button onClick={() => setEditing(null)}>返回</Button>
            </Space>
          </div>
        ) : (
          <>
            <Button
              type="primary"
              style={{ marginBottom: 15 }}
              onClick={() =>
                setEditing({
                  name: '',
                  description: '',
                  markdown: '',
                  instructions: '',
                })
              }
            >
              新增个人模板
            </Button>
            <div className="workspace-template-grid">
              {templates.map((t) => (
                <article key={t.template_id}>
                  <div>
                    <strong>{t.name}</strong>
                    {t.builtin && <Tag>内置</Tag>}
                  </div>
                  <p>{t.description}</p>
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<ArrowUpRight size={12} />}
                      onClick={() =>
                        navigate(
                          `/editor/draft?mode=knowledge&templateId=${encodeURIComponent(t.template_id)}${selected && selected !== '__uncategorized__' ? `&categoryId=${selected}` : ''}`,
                        )
                      }
                    >
                      使用
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        setEditing({
                          ...t,
                          template_id: undefined,
                          name: `${t.name}副本`,
                          builtin: undefined,
                          revision: undefined,
                        })
                      }
                    >
                      复制
                    </Button>
                    {!t.builtin && (
                      <>
                        <Button size="small" onClick={() => setEditing(t)}>
                          编辑
                        </Button>
                        <Button
                          danger
                          size="small"
                          onClick={() =>
                            Modal.confirm({
                              title: '删除模板',
                              content: '已经生成的文档保持不变。',
                              onOk: async () => {
                                await deleteTemplate(t.template_id);
                                await loadTemplates();
                              },
                            })
                          }
                        >
                          删除
                        </Button>
                      </>
                    )}
                  </Space>
                </article>
              ))}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
