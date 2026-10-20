import { useEffect, useRef, useState, type PointerEvent } from 'react';

const storageKey = 'livedoc.agent.panel-width';
const defaultWidth = 520;
export function useAgentPanelSize() {
  const [viewport, setViewport] = useState(window.innerWidth);
  const [preferred, setPreferred] = useState(() => {
    try {
      const value = Number(localStorage.getItem(storageKey));
      return value > 0 && Number.isFinite(value) ? value : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const minimum = 360;
  const maximum = Math.max(minimum, Math.min(1000, viewport - 160));
  const clamp = (value: number) => Math.min(maximum, Math.max(minimum, value));
  const width = clamp(preferred);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(preferred));
    } catch {
      /* The drawer remains resizable without browser storage. */
    }
  }, [preferred]);
  const stop = () => {
    drag.current = null;
    setResizing(false);
  };
  return {
    width,
    isNarrow: viewport < 768,
    resizing,
    handleProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': '调整文档助手宽度',
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': minimum,
      'aria-valuemax': maximum,
      'aria-valuenow': width,
      title: '拖动调整宽度，双击恢复默认；也可使用左右方向键',
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current)
          setPreferred(
            clamp(drag.current.width + drag.current.x - event.clientX),
          );
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onLostPointerCapture: stop,
      onDoubleClick: () => setPreferred(defaultWidth),
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        const actions: Record<string, number> = {
          ArrowLeft: width + 32,
          ArrowRight: width - 32,
          Home: minimum,
          End: maximum,
          Enter: defaultWidth,
        };
        if (event.key in actions) {
          event.preventDefault();
          setPreferred(clamp(actions[event.key]));
        }
      },
    },
  };
}
