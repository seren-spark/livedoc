/**
 * @file 移动端媒体查询 Hook。监听视口宽度变化并返回移动端状态。
 */
'use client';

import * as React from 'react';

/**
 * 监听媒体查询，返回当前是否处于移动端视口。
 *
 * @param breakpoint 区分移动端布局的视口宽度。
 * @returns 条件是否满足的判断结果。
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    /**
     * 在窗口宽度变化后更新移动端判断结果。
     */
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < breakpoint);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpoint]);

  return !!isMobile;
}
