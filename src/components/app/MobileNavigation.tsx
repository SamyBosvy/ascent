import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, Layers, Mountain, Plus, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionPill } from "./SessionPill";

const LEFT = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/routes", label: "Routes", icon: Mountain },
] as const;
const RIGHT = [
  { to: "/review", label: "Review", icon: Layers },
  { to: "/notes", label: "Notes", icon: BookOpen },
  { to: "/insights", label: "Insights", icon: BarChart3 },
] as const;

export function useMobileNavigationHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    let baseline = window.innerHeight;
    const update = () => {
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.matches("input:not([type=checkbox]):not([type=radio]), textarea, select") || active.isContentEditable);
      if (!editing) baseline = window.innerHeight;
      const keyboard = !!editing && Math.max(baseline, window.innerHeight) - (viewport?.height ?? window.innerHeight) > 150;
      const drawer = !!document.querySelector('[data-responsive-mode="drawer"][data-state="open"]');
      setHidden(keyboard || drawer);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "data-responsive-mode"] });
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return hidden;
}

export function MobileNavigation({ onQuickCapture }: { onQuickCapture: () => void }) {
  const hidden = useMobileNavigationHidden();
  return <>
    <div hidden={hidden} className="mobile-session fixed inset-x-4 z-30 md:hidden"><SessionPill className="max-w-full" /></div>
    <nav hidden={hidden} aria-label="Mobile navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="mobile-nav-side">
        {LEFT.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="mobile-nav-link text-muted-foreground" activeProps={{ className: "text-primary-strong font-semibold", "aria-current": "page" }}><Icon className="size-5" aria-hidden />{label}</Link>)}
      </div>
      <Button size="icon" aria-label="Quick capture" onClick={onQuickCapture} className="mobile-capture size-14 rounded-full shadow-lg"><Plus className="size-6" aria-hidden /></Button>
      <div className="mobile-nav-side">
        {RIGHT.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="mobile-nav-link text-muted-foreground" activeProps={{ className: "text-primary-strong font-semibold", "aria-current": "page" }}><Icon className="size-5" aria-hidden />{label}</Link>)}
      </div>
    </nav>
  </>;
}