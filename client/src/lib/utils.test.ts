import { describe, it, expect } from "vitest";
import { formatObjectId, isValidObjectId } from "./utils";

describe("isValidObjectId", () => {
  it("accepts 24-hex strings and rejects invalid lengths", () => {
    expect(isValidObjectId("abcdef123456abcdef123456")).toBe(true);
    expect(isValidObjectId("not-an-object-id")).toBe(false);
  });
});

describe("formatObjectId", () => {
  it("returns the requested prefix length", () => {
    const id = "abcdef123456abcdef123456";
    expect(formatObjectId(id)).toBe("abcdef12");
    expect(formatObjectId("not-an-object-id", 4)).toBe("not-");
  });
});
