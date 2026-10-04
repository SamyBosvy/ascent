import { CAMPS } from "@/lib/camp";
import { cn } from "@/lib/utils";

/** Vertical mountain with camps; climber sits at `camp` (0-4), nudged by `score` progress. */
export function Mountain({ camp, className }: { camp: number; className?: string }) {
  const H = 320;
  const ys: number[] = CAMPS.map((_, i) => H - 30 - i * ((H - 60) / 4));
  const xs = [70, 110, 80, 120, 100];
  return (
    <div className={cn("flex items-stretch gap-4", className)}>
      <svg viewBox={`0 0 200 ${H}`} className="h-80 w-40 shrink-0" role="img" aria-label={`Currently at ${CAMPS[camp]}`}>
        <path d={`M0 ${H} L100 14 L200 ${H} Z`} className="fill-ridge" opacity="0.55" />
        <path d={`M100 14 L82 66 L94 60 L100 72 L108 58 L118 66 Z`} className="fill-background" />
        <polyline
          points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeDasharray="4 5"
          opacity="0.6"
        />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={i === 4 ? 7 : 5} className={i <= camp ? (i === 4 ? "fill-gold-text" : "fill-primary") : "fill-muted-foreground/40"} />
        ))}
        <g transform={`translate(${xs[camp]!}, ${ys[camp]! - 6})`}>
          <circle r="10" className={camp === 4 ? "fill-gold" : "fill-primary"} opacity="0.25">
            <animate attributeName="r" values="9;14;9" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="6" className="fill-foreground" />
        </g>
        {camp === 4 && (
          <g transform={`translate(${xs[4]}, ${ys[4]! - 4})`}>
            <line x1="0" y1="0" x2="0" y2="-26" className="stroke-foreground" strokeWidth="2" />
            <path d="M0 -26 L16 -21 L0 -16 Z" className="fill-gold" />
          </g>
        )}
      </svg>
      <ol className="flex flex-col-reverse justify-between py-3 text-sm">
        {CAMPS.map((c, i) => (
          <li key={c} className={cn(i === camp ? "font-semibold text-foreground" : "text-muted-foreground", i === 4 && camp === 4 && "text-gold-text")}>
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
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
