import { Check } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ROUTE_COLOURS } from "@/lib/routeColours";

export function RouteColourPicker({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Colour</legend>
      <RadioGroup aria-label="Route colour" value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled} className="grid grid-cols-5 gap-2">
        {ROUTE_COLOURS.map((name, i) => (
          <RadioGroupItem key={name} value={String(i + 1)} aria-label={name} title={name} className={`route-colour-${i + 1} relative flex h-12 w-full items-center justify-center rounded-md border-border text-foreground focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=checked]:border-foreground [&>span]:hidden`}>
            <span aria-hidden="true" className="route-swatch h-6 w-6 rounded-full" />
            {value === i + 1 && <Check aria-hidden="true" className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-sm bg-background text-foreground" />}
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </fieldset>
  );
}