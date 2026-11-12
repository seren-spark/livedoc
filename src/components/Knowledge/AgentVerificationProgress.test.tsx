import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentVerificationProgress from './AgentVerificationProgress';
import type { AgentVerification } from '@/api/document-agent.types';

describe('agent verification progress', () => {
  it.each<[AgentVerification['status'], string]>([
    ['checking', '正在核验证据'],
    ['repairing', '正在修正核验问题'],
    ['rechecking', '正在复验修正结果'],
    ['passed', '证据核验通过'],
    ['incomplete', '证据核验未完成'],
  ])('renders %s separately from generation and adoption', (status, label) => {
    const html = renderToStaticMarkup(
      <AgentVerificationProgress
        steps={{}}
        verification={{ status, candidate_version: 2 }}
      />,
    );
    expect(html).toContain(label);
    expect(html).toContain('候选版本 2');
    expect(html).not.toContain('已采纳');
  });

  it('shows affected and reused steps with descriptions and id fallback', () => {
    const html = renderToStaticMarkup(
      <AgentVerificationProgress
        steps={{ read: { description: '读取第一份资料', status: 'done' } }}
        replanning={{
          invalidated_steps: ['compose'],
          reused_steps: ['read'],
          plan_version: 3,
        }}
      />,
    );
    expect(html).toContain('已调整执行计划 · 版本 3');
    expect(html).toContain('受影响步骤');
    expect(html).toContain('<li>compose</li>');
    expect(html).toContain('复用已完成步骤');
    expect(html).toContain('读取第一份资料');
  });

  it('renders verification issues and interruption reasons as text', () => {
    const html = renderToStaticMarkup(
      <AgentVerificationProgress
        steps={{}}
        verification={{
          status: 'incomplete',
          candidate_version: 0,
          message: '核验服务暂时不可用',
          issues: [{ type: 'unsupported_claim', description: '<img src=x>' }],
        }}
        waiting={{
          id: 'retry-1',
          value: {
            type: 'retry',
            failures: [
              {
                step_id: 'verify',
                code: 'MODEL_TIMEOUT',
                message: '核验请求超时，请稍后继续',
                retryable: true,
              },
            ],
          },
        }}
      />,
    );
    expect(html).toContain('核验服务暂时不可用');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('任务等待继续');
    expect(html).toContain('核验请求超时，请稍后继续');
  });

  it('keeps legacy tasks without verification or replanning compact', () => {
    expect(renderToStaticMarkup(<AgentVerificationProgress steps={{}} />)).toBe(
      '',
    );
  });
});
