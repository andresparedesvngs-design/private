import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@shared/schema";
import { campaignEngine } from "./campaignEngine";
import { storage } from "./storage";
import { whatsappManager } from "./whatsappManager";

const makePool = (overrides: Partial<Pool> = {}): Pool => ({
  id: "pool-default",
  name: "Pool",
  strategy: "fixed_turns",
  delayBase: 1000,
  delayVariation: 500,
  sessionIds: [],
  targetSessionCount: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("campaignEngine pool refill", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters out sessions already assigned to other pools", async () => {
    const currentPool = makePool({
      id: "pool-current",
      sessionIds: ["session-a"],
      targetSessionCount: 2,
    });

    vi.spyOn(
      whatsappManager,
      "getVerifiedConnectedSessionIdsWithOptions"
    ).mockReturnValue(["session-b", "session-c", "session-d"]);
    vi.spyOn(storage, "getPools").mockResolvedValue([
      currentPool,
      makePool({
        id: "pool-other",
        sessionIds: ["session-c"],
        targetSessionCount: 1,
      }),
    ]);

    const candidates = await (campaignEngine as any).getRefillCandidates(
      currentPool
    );
    expect(candidates).toEqual(["session-b", "session-d"]);
  });

  it("adds only the number needed to reach targetSessionCount", async () => {
    const currentPool = makePool({
      id: "pool-current",
      sessionIds: ["session-a"],
      targetSessionCount: 3,
    });

    vi.spyOn(
      campaignEngine as any,
      "getCampaignPoolFallbackAnySession"
    ).mockReturnValue(true);
    vi.spyOn(campaignEngine as any, "getRefillCandidates").mockResolvedValue([
      "session-b",
      "session-c",
      "session-d",
    ]);
    const addSpy = vi
      .spyOn(campaignEngine as any, "addSessionsToPool")
      .mockResolvedValue(["session-b", "session-c"]);

    const added = await (campaignEngine as any).refillPoolToTargetSessionCount(
      "campaign-1",
      currentPool,
      "unit_test"
    );

    expect(addSpy).toHaveBeenCalledWith(
      "campaign-1",
      currentPool,
      ["session-b", "session-c"],
      "unit_test",
      undefined
    );
    expect(added).toEqual(["session-b", "session-c"]);
  });
});
