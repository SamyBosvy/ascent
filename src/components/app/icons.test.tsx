import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Constants } from "@/integrations/supabase/types";
import { CAMP_ICONS, ROUTE_TYPE_ICONS } from "./icons";

const icons = [...CAMP_ICONS, ...Object.values(ROUTE_TYPE_ICONS)];
describe("Ascent icons", () => {
  icons.forEach((Icon, index) => {
    it(`icon ${index} is decorative by default`, () => {
      const { container } = render(<Icon className="size-5" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("stroke-width", "1.8");
      expect(svg).toHaveClass("size-5");
      cleanup();
    });
    it(`icon ${index} exposes an optional title`, () => {
      const { container } = render(<Icon title="Standalone symbol" />);
      const svg = screen.getByRole("img", { name: "Standalone symbol" });
      expect(svg).not.toHaveAttribute("aria-hidden");
      expect(container.querySelector("title")).toHaveTextContent("Standalone symbol");
      cleanup();
    });
  });
  it("maps every generated RouteType enum value, with no extra keys", () => {
    expect(Object.keys(ROUTE_TYPE_ICONS).sort()).toEqual([...Constants.public.Enums.route_type].sort());
    for (const type of Constants.public.Enums.route_type) expect(typeof ROUTE_TYPE_ICONS[type]).toBe("function");
  });
});