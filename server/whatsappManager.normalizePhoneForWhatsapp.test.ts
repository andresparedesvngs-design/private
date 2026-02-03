import { describe, it, expect, afterEach, vi } from "vitest";
import { whatsappManager } from "./whatsappManager";

describe("whatsappManager.normalizePhoneForWhatsapp", () => {
  const normalize = (phone: string) =>
    (whatsappManager as any).normalizePhoneForWhatsapp(phone);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes phones based on SMS country defaults", () => {
    vi.stubEnv("SMS_DEFAULT_COUNTRY_CODE", "56");
    vi.stubEnv("SMS_ENFORCE_CHILE_MOBILE", "true");
    expect(normalize("09 1234 5678")).toBe("56912345678");

    vi.stubEnv("SMS_DEFAULT_COUNTRY_CODE", "1");
    vi.stubEnv("SMS_ENFORCE_CHILE_MOBILE", "false");
    expect(normalize("(415) 555-0000")).toBe("14155550000");
  });
});
