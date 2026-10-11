import { Children, Fragment, isValidElement, useEffect, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const DESKTOP_SELECT_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

type Option = { value: string; label: string; disabled: boolean };
function textOf(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join("");
}
function optionsOf(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? textOf(child.props.children)), label: child.props.label ?? textOf(child.props.children), disabled: disabled || Boolean(child.props.disabled) }];
    if (child.type === Fragment || child.type === "optgroup") return optionsOf(child.props.children, disabled || Boolean(child.props.disabled));
    return [];
  });
}

/** Native during SSR/touch; Radix on fine-pointer desktops, latched while open. */
export function ResponsiveSelect({ className, children, value, defaultValue, onChange, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsOf(children);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? options.find((option) => !option.disabled)?.value ?? ""));
  const selected = value === undefined ? localValue : String(value);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_SELECT_QUERY);
    const update = () => { if (!open) setDesktop(media.matches); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [open]);

  const controlClass = cn("h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className);
  if (!desktop || props.multiple) return <select {...props} value={value === undefined ? localValue : value} onChange={(event) => { setLocalValue(event.target.value); onChange?.(event); }} className={controlClass}>{children}</select>;
  const label = options.find((option) => option.value === selected)?.label;
  return <Select value={`option:${selected}`} open={open} onOpenChange={setOpen} disabled={props.disabled} required={props.required} name={props.name} onValueChange={(encoded) => {
    const next = encoded.slice("option:".length);
    setLocalValue(next);
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>);
  }}>
    <SelectTrigger id={props.id} aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} title={props.title ?? label} autoFocus={props.autoFocus} className={cn(controlClass, "shadow-none focus:ring-2 [&>span]:min-w-0 [&>span]:truncate [&>svg]:shrink-0")}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="max-w-[calc(100vw-2rem)] border-border bg-popover text-popover-foreground">
      {options.map((option) => <SelectItem key={option.value} value={`option:${option.value}`} disabled={option.disabled} textValue={option.label} title={option.label} className="min-h-10 text-base font-body data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&>span:last-child]:min-w-0 [&>span:last-child]:truncate"><span className="block truncate">{option.label}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}