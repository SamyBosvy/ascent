import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** SSR starts as Dialog; an open session keeps its primitive across resizes. */
export function useDrawerMode(open: boolean) {
  const [mobile, setMobile] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => { if (!opened.current) setMobile(media.matches); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!opened.current || !open) setMobile(window.matchMedia("(max-width: 639px)").matches);
    opened.current = open;
  }, [open]);
  return mobile;
}

export const ResponsiveDialogHeader = DialogHeader;
export const ResponsiveDialogTitle = DialogTitle;
export const ResponsiveDialogDescription = DialogDescription;
export const ResponsiveDialogFooter = DialogFooter;

export function ResponsiveDialog({ open, onOpenChange, title, description, children, footer, className, dirty, submitting = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode;
  children: ReactNode; footer?: ReactNode; className?: string; dirty?: boolean; submitting?: boolean;
}) {
  const mobile = useDrawerMode(open);
  const [discard, setDiscard] = useState(false);
  const [edited, setEdited] = useState(false);
  const isDirty = dirty ?? edited;
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) { setDiscard(false); setEdited(false); return; }
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  useEffect(() => {
    if (!open || !mobile) return;
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      panel.current?.style.setProperty("--sheet-height", `${height * 0.9}px`);
      panel.current?.style.setProperty("--sheet-bottom", `${bottom}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, [open, mobile]);
  function change(next: boolean) {
    if (!next && submitting) return;
    if (!next && isDirty) { setDiscard(true); return; }
    onOpenChange(next);
  }
  const Header = mobile ? DrawerHeader : DialogHeader;
  const Title = mobile ? DrawerTitle : DialogTitle;
  const Description = mobile ? DrawerDescription : DialogDescription;
  const Footer = mobile ? DrawerFooter : DialogFooter;
  const Content = mobile ? DrawerContent : DialogContent;
  const Root = mobile ? Drawer : Dialog;
  return <>
    <Root open={open} onOpenChange={change} {...(mobile ? { shouldScaleBackground: false, dismissible: !isDirty && !submitting, repositionInputs: false, autoFocus: true } : {})}>
      <Content ref={panel} data-responsive-mode={mobile ? "drawer" : "dialog"}
        {...(!description ? { "aria-describedby": undefined } : {})}
        className={cn("responsive-panel", mobile ? "responsive-sheet" : "max-h-[90dvh]", className)}
        onEscapeKeyDown={(e) => { e.preventDefault(); change(false); }}
        onPointerDownOutside={(e) => { if (isDirty || submitting) { e.preventDefault(); if (!submitting) setDiscard(true); } }}
        onCloseAutoFocus={(e) => { if (trigger.current?.isConnected) { e.preventDefault(); trigger.current.focus(); } }}>
        <Header className="shrink-0 pr-12"><Title>{title}</Title>{description && <Description>{description}</Description>}</Header>
        {mobile && <Button variant="ghost" size="icon" className="absolute right-2 top-6 min-h-12 min-w-12" aria-label="Close" disabled={submitting} onClick={() => change(false)}><X /></Button>}
        <div className="responsive-body" onChangeCapture={() => setEdited(true)}>{children}</div>
        {footer && <Footer className="responsive-footer">{footer}</Footer>}
      </Content>
    </Root>
    <AlertDialog open={discard && open} onOpenChange={setDiscard}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard changes?</AlertDialogTitle><AlertDialogDescription>Your unsaved input will be lost.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel className="min-h-12">Keep editing</AlertDialogCancel><AlertDialogAction className="min-h-12" disabled={submitting} onClick={() => { setDiscard(false); onOpenChange(false); }}>Discard changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
