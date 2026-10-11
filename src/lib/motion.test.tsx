import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { prefersReducedMotion, usePrefersReducedMotion } from './motion';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('reads device values, updates both ways and unsubscribes', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  const original = window.matchMedia('');
  vi.spyOn(window, 'matchMedia').mockReturnValue({ ...original,
    get matches() { return matches; },
    addEventListener: (_: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener); },
  } as MediaQueryList);
  expect(prefersReducedMotion()).toBe(false);
  const { result, unmount } = renderHook(usePrefersReducedMotion);
  expect(result.current).toBe(false);
  act(() => { matches = true; listeners.forEach(fn => fn()); });
  expect(prefersReducedMotion()).toBe(true);
  expect(result.current).toBe(true);
  act(() => { matches = false; listeners.forEach(fn => fn()); });
  expect(result.current).toBe(false);
  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  unmount();
  expect(listeners.size).toBe(0);
});