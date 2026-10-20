// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import AgentMarkdown from './AgentMarkdown';

describe('agent formatted preview', () => {
  it('opens the evidence associated with a clicked citation', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const citation = { id: 'ref-first', title: '第一段', kind: 'text' as const, source_content: '原文证据' };
    let opened: typeof citation | undefined;
    const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(async () => root.render(
        <AgentMarkdown citations={[citation]} onCitationClick={(value) => { opened = value as typeof citation; }}>
          {'结论 [ref-first]'}
        </AgentMarkdown>,
      ));
      await act(async () => container.querySelector('button')!.click());
      expect(opened).toBe(citation);
    } finally {
      await act(async () => root.unmount());
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
  it('links adopted evidence in prose without changing code, escaped markers or existing links', () => {
    const citations = [{ id: 'ref-notes:1:0:12', title: '来源甲', kind: 'text' as const }, { id: 'unused', title: '未采用', kind: 'text' as const }];
    const html = renderToStaticMarkup(
      <AgentMarkdown citations={citations.slice(0, 1)} onCitationClick={() => {}}>
        {'事实 [ref-notes:1:0:12]。\n\n`[ref-notes:1:0:12]`\n\n```txt\n[ref-notes:1:0:12]\n```\n\n\\[ref-notes:1:0:12]，另见 [ref-notes:1:0:12]。\n\n[已有链接](https://example.com)\n\n[unused] [unknown]'}
      </AgentMarkdown>,
    );
    expect(html.match(/class="agent-citation"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="查看来源：来源甲"');
    expect(html).toContain('[1]</button>');
    expect(html).toContain('<code>[ref-notes:1:0:12]</code>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('[unused] [unknown]');
  });
  it('renders GFM tables and nested highlights without treating code as markup', () => {
    const html = renderToStaticMarkup(
      <AgentMarkdown>
        {
          '# 评测\n\n==**关键**结论==\n\n| 指标 | 含义 |\n| --- | --- |\n| Recall | 检索覆盖 |\n\n`==literal==`\n\n```ts\nconst x = "==code==";\n```'
        }
      </AgentMarkdown>,
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<mark><strong>关键</strong>结论</mark>');
    expect(html).toContain('<code>==literal==</code>');
    expect(html).toContain('==code==');
    expect(html).not.toContain('<mark>code</mark>');
  });
  it('leaves escaped markers, unmatched markers and raw HTML inert', () => {
    const html = renderToStaticMarkup(
      <AgentMarkdown>
        {'\\==literal==\n\n==unfinished\n\n<img src=x onerror="alert(1)">'}
      </AgentMarkdown>,
    );
    expect(html).not.toContain('<mark>');
    expect(html).not.toContain('<img');
    expect(html).toContain('==unfinished');
  });
});
