import { describe, it, expect, vi } from "vitest";
import { campaignEngine } from "./campaignEngine";

describe("campaignEngine.pickTemplateIndex", () => {
  const pickTemplateIndex = (
    strategy: string | undefined,
    templates: string[],
    index: number,
  ) => (campaignEngine as any).pickTemplateIndex(strategy, templates, index);

  it("uses round robin for fixed turn strategies", () => {
    const templates = ["a", "b", "c"];
    expect(pickTemplateIndex("round_robin", templates, 0)).toBe(0);
    expect(pickTemplateIndex("fixed_turns", templates, 1)).toBe(1);
    expect(pickTemplateIndex("turnos_fijos", templates, 4)).toBe(1);
  });

  it("uses Math.random for random strategies", () => {
    const templates = ["a", "b", "c", "d"];
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.74)
      .mockReturnValueOnce(0.01);
    expect(pickTemplateIndex("random", templates, 0)).toBe(2);
    expect(pickTemplateIndex("turnos_aleatorios", templates, 0)).toBe(0);
    randomSpy.mockRestore();
  });
});
