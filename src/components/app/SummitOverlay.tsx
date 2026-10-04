import { useEffect } from "react";

export function SummitOverlay({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <button onClick={onDone} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm" aria-label="Close">
      <div className="relative h-56 w-64">
        <div className="animate-glow-in absolute left-1/2 top-6 h-40 w-40 -translate-x-1/2 rounded-full bg-gold/25 blur-2xl" />
        <svg viewBox="0 0 260 220" className="relative h-full w-full">
          <path d="M10 210 L130 70 L250 210 Z" className="fill-ridge" />
          <path d="M130 70 L108 120 L122 112 L130 128 L140 110 L154 120 Z" className="fill-background" />
          <g className="animate-flag-rise">
            <line x1="130" y1="72" x2="130" y2="12" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" />
            <path d="M131 14 L172 24 L131 36 Z" className="animate-flag-wave fill-gold" />
          </g>
        </svg>
      </div>
      <p className="mt-4 text-sm uppercase tracking-[0.2em] text-muted-foreground">Summit reached</p>
      <h2 className="mt-2 px-6 text-center text-3xl font-semibold">{name}</h2>
      <p className="mt-3 text-muted-foreground">Moved to your Summits shelf. Take in the view.</p>
    </button>
  );
}
