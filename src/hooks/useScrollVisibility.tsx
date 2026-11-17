/**
 * @file 滚动显示 Hook。根据页面滚动方向更新浮动界面元素的可见性。
 */
// src/hooks/useScrollVisibility.ts
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 根据滚动位置与方向计算界面元素是否显示。
 *
 * @param threshold 决定是否保留或匹配的分数阈值。
 * @returns 条件是否满足的判断结果。
 */
export const useScrollVisibility = (threshold = 100) => {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef<number>(0);

  /**
   * 响应滚动事件，更新当前视图依赖的滚动状态。
   */
  const handleScroll = useCallback(() => {
    // 记录当前滚动位置
    const currentScrollY = window.scrollY;

    // 如果滚动距离小于阈值，则保持可见
    if (currentScrollY < threshold) {
      return;
    }

    // 如果向下滚动距离过大，隐藏元素
    if (currentScrollY - lastScrollY.current > 0) {
      if (visible) {
        setVisible(false);
      }
    } else {
      // 如果向上滚动，显示元素
      if (!visible) {
        setVisible(true);
      }
    }

    // 更新上次滚动位置
    lastScrollY.current = currentScrollY;
  }, [visible, threshold]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return visible;
};
