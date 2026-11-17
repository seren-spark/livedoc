/**
 * @file 文章审核。连接路由与对应业务组件，呈现文章审核的界面与交互。
 */
import ArticleTable from '@/components/Admin/ArticleTable';

/**
 * 呈现文章审核对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function article() {
  return <ArticleTable />;
}
