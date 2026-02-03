import { describe, it, expect, vi } from 'vitest';
import { smsManager } from '@server/smsManager';

// Mock environment variables
vi.stubEnv('SMS_DEFAULT_COUNTRY_CODE', '56');

describe('SmsManager.normalizePhoneForSms', () => {
  const normalizePhone = (phone: string) => {
    return (smsManager as any).normalizePhoneForSms(phone);
  };

  it('should keep already normalized numbers', () => {
    expect(normalizePhone('+56987654321')).toBe('+56987654321');
  });

  it('should convert 00-prefix to +', () => {
    expect(normalizePhone('0056987654321')).toBe('+56987654321');
  });

  it('should add default country code', () => {
    expect(normalizePhone('12345678')).toBe('+5612345678');
  });

  it('should handle chilean mobile numbers (9 digits starting with 9)', () => {
    expect(normalizePhone('987654321')).toBe('+56987654321');
  });

  it('should handle chilean mobile numbers (10 digits starting with 09)', () => {
    expect(normalizePhone('0987654321')).toBe('+56987654321');
  });

  it('should handle chilean mobile numbers with country code but no +', () => {
    expect(normalizePhone('56987654321')).toBe('+56987654321');
  });

  it('should remove spaces and special characters', () => {
    expect(normalizePhone(' 9 8765-4321 ')).toBe('+56987654321');
  });
});
