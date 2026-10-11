import { CAMPS } from "@/lib/camp";
import { cn } from "@/lib/utils";
import { climberPosition, visualScoreForCamp } from '@/lib/visualProgress';

/** Continuous climber constrained to the displayed camp, including manual overrides. */
export function Mountain({ camp, score = 0, className }: { camp: number; score?: number; className?: string }) {
  const visualScore = visualScoreForCamp(score, camp);
  const position = climberPosition(visualScore);
  const H = 320;
  const ys: number[] = CAMPS.map((_, i) => H - 30 - i * ((H - 60) / 4));
  const xs = [70, 110, 80, 120, 100];
  return (
    <div className={cn("flex min-w-0 items-stretch gap-4", className)}>
      <svg viewBox={`0 0 200 ${H}`} className="h-48 w-28 shrink-0 sm:h-80 sm:w-40" role="img" aria-label={position.current === 4 ? 'At Summit' : `${Math.floor(visualScore * 100)}% visual progress, between ${CAMPS[position.current]} and ${CAMPS[position.next]}`}>
        <path d={`M0 ${H} L100 14 L200 ${H} Z`} className="fill-ridge" opacity="0.55" />
        <path d={`M100 14 L82 66 L94 60 L100 72 L108 58 L118 66 Z`} className="fill-background" />
        <polyline
          points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")}
          fill="none"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeDasharray="4 5"
        />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={i === 4 ? 7 : 5} className={i <= camp ? (i === 4 ? "fill-gold-text" : "fill-primary") : "fill-muted-foreground"} />
        ))}
        <g className="mountain-climber" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
          <circle r="10" className={camp === 4 ? "fill-gold" : "fill-primary"} opacity="0.25" />
          <circle r="6" className="fill-foreground" />
        </g>
        {camp === 4 && (
          <g transform="translate(100, 26)">
            <line x1="0" y1="0" x2="0" y2="-26" className="stroke-foreground" strokeWidth="2" />
            <path d="M0 -26 L16 -21 L0 -16 Z" className="fill-gold" />
          </g>
        )}
      </svg>
      <ol className="flex flex-col-reverse justify-center gap-4 py-3 body-text sm:justify-between sm:gap-0">
        {CAMPS.map((c, i) => (
          <li key={c} className={cn(i !== position.current && i !== position.next && 'hidden sm:list-item', i === position.current ? "font-semibold text-foreground" : "text-muted-foreground", i === 4 && camp === 4 && "text-gold-text")}>
            {c}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CampBadge({ camp }: { camp: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 meta-text font-medium",
        camp === 4 ? "bg-gold/20 text-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", camp === 4 ? "bg-gold-text" : "bg-primary")} />
      {CAMPS[camp]}
    </span>
  );
}

export function AltitudeBar({ camp }: { camp: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {CAMPS.map((_, i) => (
        <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= camp ? (camp === 4 ? "bg-gold-text" : "bg-primary") : "bg-muted")} />
      ))}
    </div>
  );
}
