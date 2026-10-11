import { useId, type ComponentType, type SVGProps } from "react";
import type { RouteType } from "@/lib/data";

export type AscentIconProps = SVGProps<SVGSVGElement> & { title?: string };

function icon(paths: React.ReactNode): ComponentType<AscentIconProps> {
  return function AscentIcon({ title, children, ...props }: AscentIconProps) {
    const titleId = useId();
    return <svg width="24" height="24" {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-labelledby={title ? titleId : undefined}>
      {title && <title id={titleId}>{title}</title>}{paths}{children}
    </svg>;
  };
}

export const BaseCampIcon = icon(<><path d="M2 21h20M4 21l8-12 8 12Z" /><path d="m9 21 3-5 3 5M12 9V6" /></>);
export const Camp1Icon = icon(<><path d="m2 21 5-6M17 15l5 6M5 16l7-11 7 11ZM9 16l3-5 3 5M12 5V3" /><path d="M5 21h14" /></>);
export const Camp2Icon = icon(<><path d="m2 21 6-8M16 13l6 8M6 13l6-9 6 9ZM10 13l2-4 2 4M12 4V2M6 17h12M4 21h16" /></>);
export const Camp3Icon = icon(<><path d="m2 21 7-12M15 9l7 12M7 9l5-7 5 7ZM10 9l2-3 2 3M8 13h8M6 17h12M4 21h16" /></>);
export const SummitIcon = icon(<><path d="m2 21 10-13 10 13ZM12 8V2l7 3-7 3M8 13l4 3 4-3" /></>);
export const BookIcon = icon(<><path d="M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2ZM12 6v15" /><path d="m5 14 2-3 2 3M15 8h4M15 12h4" /></>);
export const LanguageIcon = icon(<><path d="M3 3h14v10H8l-5 3ZM7 7h6M10 5v2c0 3-2 4-4 4M8 7c0 2 2 4 4 4" /><path d="m14 21 4-8 4 8M16 18h4" /></>);
export const SkillIcon = icon(<><path d="m2 21 6-9 4 5 4-10 6 14ZM8 12l1 4M16 7l1 6M4 4h4M6 2v4" /></>);
export const CourseIcon = icon(<><path d="m2 7 10-5 10 5-10 5ZM5 9v7c4 3 10 3 14 0V9M22 7v9" /><path d="m9 16 3-4 3 4" /></>);
export const PaperIcon = icon(<><path d="M5 2h10l4 4v16H5ZM15 2v5h4M8 11h8M8 14h8" /><path d="m8 19 3-3 3 3h2" /></>);
export const HabitIcon = icon(<><path d="M5 5a9 9 0 0 1 15 4M19 19A9 9 0 0 1 4 15M20 4v5h-5M4 20v-5h5" /><path d="m8 12 3 3 5-6" /></>);

// Frameworks use the Skill route type, so share its symbol.
export const ROUTE_TYPE_ICONS = {
  book: BookIcon, language: LanguageIcon, skill: SkillIcon,
  course: CourseIcon, paper: PaperIcon, habit: HabitIcon,
} satisfies Record<RouteType, ComponentType<AscentIconProps>>;
export const CAMP_ICONS = [BaseCampIcon, Camp1Icon, Camp2Icon, Camp3Icon, SummitIcon] as const;