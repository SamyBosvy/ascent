import { Bar, Line, Tooltip } from 'recharts';
import type { ComponentProps } from 'react';
import { usePrefersReducedMotion } from '@/lib/motion';

export function MotionBar(props: ComponentProps<typeof Bar>) {
  const reduced = usePrefersReducedMotion();
  return <Bar {...props} isAnimationActive={!reduced} />;
}

export function MotionLine(props: ComponentProps<typeof Line>) {
  const reduced = usePrefersReducedMotion();
  return <Line {...props} isAnimationActive={!reduced} />;
}

export function MotionTooltip(props: ComponentProps<typeof Tooltip>) {
  const reduced = usePrefersReducedMotion();
  return <Tooltip {...props} isAnimationActive={!reduced} />;
}

// Recharts discovers series and tooltips by displayName before rendering children.
MotionBar.displayName = 'Bar';
MotionLine.displayName = 'Line';
MotionTooltip.displayName = 'Tooltip';