import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MotionBar, MotionLine, MotionTooltip } from './MotionChart';

const capture = vi.hoisted(() => ({ bar: vi.fn(), line: vi.fn(), tooltip: vi.fn() }));
vi.mock('recharts', () => ({
  Bar: (props: unknown) => { capture.bar(props); return null; },
  Line: (props: unknown) => { capture.line(props); return null; },
  Tooltip: (props: unknown) => { capture.tooltip(props); return null; },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
it.each([true, false])('all chart motion follows reduced=%s', reduced => {
  const original = window.matchMedia('');
  vi.spyOn(window, 'matchMedia').mockReturnValue({ ...original, matches: reduced });
  render(<><MotionBar dataKey="minutes" /><MotionLine dataKey="retention" /><MotionTooltip /></>);
  for (const spy of Object.values(capture)) {
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ isAnimationActive: !reduced }));
  }
});