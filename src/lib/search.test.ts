import { describe, expect, it } from "vitest";
import { prefixTsQuery, safeTerm } from "./search";

describe("safeTerm", () => {
  it("keeps apostrophes and dots matching as single-character wildcards", () => {
    expect(safeTerm("l'eau")).toBe("l_eau");
    expect(safeTerm("l’eau")).toBe("l_eau");
    expect(safeTerm("l‘eau")).toBe("l_eau");
    expect(safeTerm("e.g.")).toBe("e_g_");
    expect(safeTerm("it's")).toBe("it_s");
    expect(safeTerm("12:30")).toBe("12_30");
  });

  it("turns filter syntax characters into spaces and collapses whitespace", () => {
    expect(safeTerm("a,b(c)")).toBe("a b c");
    expect(safeTerm("50%*")).toBe("50");
    expect(safeTerm('say "hi"')).toBe("say hi");
    expect(safeTerm("  a   b  ")).toBe("a b");
  });
});

describe("prefixTsQuery", () => {
  it("splits on punctuation the way the 'simple' parser indexes it", () => {
    expect(prefixTsQuery("l'eau")).toBe("l:* & eau:*");
    expect(prefixTsQuery("e.g.")).toBe("e:* & g:*");
  });

  it("handles plain words and punctuation-only input", () => {
    expect(prefixTsQuery("  hello   world ")).toBe("hello:* & world:*");
    expect(prefixTsQuery("!!!")).toBe("");
    expect(prefixTsQuery("")).toBe("");
  });
});
