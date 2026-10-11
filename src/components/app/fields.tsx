import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { BaseCampIcon, SummitIcon } from "./icons";
import { cloneElement, type ReactElement } from "react";

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  );
}

export type EmptyIllustration = "ridge" | "path" | "flag" | "tent" | "cards" | "notebook" | "chart" | "calendar";

export function EmptyIllustration({ variant }: { variant: EmptyIllustration }) {
  const shapes: Record<EmptyIllustration, React.ReactNode> = {
    ridge: <path d="M16 84 52 30 78 64 94 44 128 84Z" className="fill-ridge stroke-muted-foreground" />,
    path: <><path d="M16 84 72 22 128 84Z" className="fill-ridge stroke-muted-foreground" /><path d="m48 84 20-16-6-14 16-10-6-22" className="stroke-primary" /></>,
    flag: <SummitIcon x="24" y="6" width="96" height="96" className="text-gold-text" />,
    tent: <BaseCampIcon x="24" y="6" width="96" height="96" className="text-primary-strong" />,
    cards: <><rect x="30" y="18" width="68" height="64" rx="5" className="fill-ridge stroke-muted-foreground" /><rect x="46" y="30" width="68" height="64" rx="5" className="fill-background stroke-primary" /><path d="m60 70 18-24 22 24M60 82h40" className="stroke-primary" /></>,
    notebook: <><rect x="36" y="16" width="76" height="78" rx="4" className="fill-ridge stroke-muted-foreground" /><path d="M50 16v78M62 38h34M62 52h34M62 66h24" className="stroke-primary" /></>,
    chart: <><path d="M28 18v72h94" /><path d="M48 78V60M72 78V42M96 78V26" strokeWidth="10" className="stroke-primary" /><path d="m42 44 27-22 30-8" className="stroke-gold-text" /></>,
    calendar: <><rect x="30" y="24" width="84" height="66" rx="4" className="fill-ridge stroke-muted-foreground" /><path d="M30 42h84M50 14v20M94 14v20" /><path d="m54 66 12 12 24-24" className="stroke-primary" /></>,
  };
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 144 108" className="mx-auto h-24 w-32 sm:h-28 sm:w-36 fill-none stroke-muted-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{shapes[variant]}</svg>;
}

export function Empty({ illustration, title, description, primaryAction, secondaryLink, headingLevel = 3 }: {
  illustration: EmptyIllustration;
  title: string;
  description: string;
  primaryAction: ReactElement<{ className?: string }>;
  secondaryLink?: ReactElement<{ className?: string }>;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
    <EmptyIllustration variant={illustration} />
    <div className="max-w-sm space-y-1"><Heading className="card-title text-foreground">{title}</Heading><p className="body-text text-muted-foreground">{description}</p></div>
    {cloneElement(primaryAction, { className: cn(primaryAction.props.className, "min-h-12 max-w-full whitespace-normal") })}
    {secondaryLink && cloneElement(secondaryLink, { className: cn(secondaryLink.props.className, "inline-flex min-h-12 items-center body-text text-primary-strong underline underline-offset-4") })}
  </div>;
}
