/**
 * @file 前台右侧栏。组织前台右侧栏的界面与交互。
 */
import {
  Col,
  Space,
  Card,
  Button,
  List,
  Badge,
  Avatar,
  Typography,
} from 'antd';
import './index.scss';
import { useEffect, useRef, useState } from 'react';
const { Text, Title } = Typography;
// 热门话题数据
const hotTopics = [
  'package.json 中 dependencies 的版本号',
  '一个 4.7 GB 视频的浏览器拖进 OOM',
  'JDK17 前后写法对比：差点忘了法对比：差点忘了',
  '开源一个掘金自动签到的油猴脚本',
  'LangChain已死？不，是时候重新认识它了',
];
interface RightSideProps {
  children?: React.ReactNode;
}
/**
 * 检查元素是否处于当前可视区域。
 *
 * @param element 需要定位或滚动到的 DOM 元素。
 * @returns 条件是否满足的判断结果。
 */
const isElementInView = (element: HTMLElement): boolean => {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  // 判断元素是否完全在窗口内
  const isInView = !(rect.bottom < 0);

  return isInView;
};
// 推荐作者数据
const recommendAuthors = [
  {
    name: '天天摸鱼的Java工程师',
    title: '软件开发工程师',
    avatar: 'https://avatars.githubusercontent.com/u/2?v=4',
  },
  {
    name: '前端小智',
    title: '前端开发',
    avatar: 'https://avatars.githubusercontent.com/u/3?v=4',
  },
];
/**
 * 呈现前台右侧栏，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export default function RightSide({ children }: RightSideProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isTop, setIsTop] = useState<boolean>(false);
  useEffect(() => {
    /**
     * 检测侧栏是否进入视口，并更新悬浮展示状态。
     */
    const checkSidebarInView = () => {
      if (sidebarRef.current) {
        const isInView = isElementInView(sidebarRef.current);
        setIsTop(!isInView);
      }
    };

    // 初始检查
    checkSidebarInView();

    // 监听滚动和窗口大小变化事件
    window.addEventListener('scroll', checkSidebarInView);
    window.addEventListener('resize', checkSidebarInView);

    // 清理事件监听器
    return () => {
      window.removeEventListener('scroll', checkSidebarInView);
      window.removeEventListener('resize', checkSidebarInView);
    };
  }, []);
  return (
    <div className="rightSide-container">
      <div className="rightSide-placeholder"></div>
      <Col
        ref={sidebarRef}
        className="article-rightSide"
        style={{ width: '330px' }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {children ? (
            <>{children}</>
          ) : (
            <>
              {/* 问候卡片 */}
              <Card
                style={{
                  background:
                    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    color: '#fff',
                    textAlign: 'center',
                    padding: '20px 0',
                  }}
                >
                  <Title level={3} style={{ color: '#fff', margin: 0 }}>
                    上午好！
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.8)' }}>
                    掘友在社区的每一天
                  </Text>
                  <div style={{ marginTop: '16px' }}>
                    <Button ghost>去签到</Button>
                  </div>
                </div>
              </Card>
              {/* 文章榜*/}
              <Card
                size="small"
                className="article-rank"
                title="📝 文章榜"
                extra="换一换"
                style={{ border: 'none', borderRadius: '8px' }}
              >
                <List
                  dataSource={hotTopics}
                  renderItem={(topic, index) => (
                    <List.Item style={{ padding: '8px' }}>
                      <Space className="w-full">
                        <Badge
                          count={index + 1}
                          style={{
                            backgroundColor: index < 3 ? '#ff4d4f' : '#d9d9d9',
                            color: index < 3 ? '#fff' : '#666',
                          }}
                        />

                        {topic}
                      </Space>
                    </List.Item>
                  )}
                />
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <Button type="link" size="small">
                    查看更多
                  </Button>
                </div>
              </Card>
              {/* 推荐作者 */}
              <Card
                size="small"
                title="👤 作者榜"
                style={{ borderRadius: '8px', padding: '12px' }}
              >
                <List
                  itemLayout="horizontal"
                  dataSource={recommendAuthors}
                  renderItem={(author) => (
                    <List.Item style={{ padding: '12px 0' }}>
                      <List.Item.Meta
                        className="flex-center"
                        avatar={
                          <Avatar
                            src={author.avatar}
                            style={{ display: 'block', margin: '0' }}
                          />
                        }
                        title={author.name}
                        description={author.title}
                      />
                      <Button size="small" type="primary" ghost>
                        + 关注
                      </Button>
                    </List.Item>
                  )}
                />
              </Card>
              <Card
                title="📝 热门标签"
                extra="换一换"
                style={{ border: 'none', borderRadius: '8px' }}
              >
                <List
                  dataSource={hotTopics}
                  renderItem={(topic, index) => (
                    <List.Item style={{ border: 'none' }}>
                      <Space>
                        <Badge
                          count={index + 1}
                          style={{
                            backgroundColor: index < 3 ? '#ff4d4f' : '#d9d9d9',
                            color: index < 3 ? '#fff' : '#666',
                          }}
                        />
                        <Text
                          style={{
                            fontSize: '14px',
                            color: index < 3 ? '#252933' : '#8a919f',
                            cursor: 'pointer',
                          }}
                        >
                          {topic}
                        </Text>
                      </Space>
                    </List.Item>
                  )}
                />
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <Button type="link" size="small">
                    查看更多
                  </Button>
                </div>
              </Card>
              {/* 滚动后的代替 */}
              <div className={`sticky-rightSide ${isTop ? 'top' : ''}`}>
                <Space direction="vertical" size="large">
                  <Card
                    title="📝 文章榜22"
                    extra="换一换"
                    style={{ border: 'none', borderRadius: '8px' }}
                  >
                    <List
                      dataSource={hotTopics}
                      renderItem={(topic, index) => (
                        <List.Item style={{ border: 'none' }}>
                          <Space>
                            <Badge
                              count={index + 1}
                              style={{
                                backgroundColor:
                                  index < 3 ? '#ff4d4f' : '#d9d9d9',
                                color: index < 3 ? '#fff' : '#666',
                              }}
                            />
                            <Text
                              style={{
                                fontSize: '14px',
                                color: index < 3 ? '#252933' : '#8a919f',
                                cursor: 'pointer',
                              }}
                            >
                              {topic}
                            </Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                    <div style={{ textAlign: 'center', marginTop: '16px' }}>
                      <Button type="link" size="small">
                        查看更多
                      </Button>
                    </div>
                  </Card>
                  <Card
                    title="👤 作者榜222"
                    style={{ border: 'none', borderRadius: '8px' }}
                  >
                    <List
                      dataSource={recommendAuthors}
                      renderItem={(author) => (
                        <List.Item
                          style={{ border: 'none', padding: '12px 0' }}
                        >
                          <List.Item.Meta
                            avatar={<Avatar src={author.avatar} />}
                            title={
                              <Text
                                style={{ fontSize: '14px', fontWeight: 'bold' }}
                              >
                                {author.name}
                              </Text>
                            }
                            description={
                              <Text
                                type="secondary"
                                style={{ fontSize: '12px' }}
                              >
                                {author.title}
                              </Text>
                            }
                          />
                          <Button size="small" type="primary" ghost>
                            + 关注
                          </Button>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Space>
              </div>
            </>
          )}
        </Space>
      </Col>
    </div>
  );
}
