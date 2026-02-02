import { storage } from "./storage";
import type { GsmLine } from "@shared/schema";
import { Buffer } from "node:buffer";

type SmsSendResult = {
  ok: boolean;
  status: number;
  body: string;
  url: string;
};

type InfobipAuthType = "basic" | "apikey" | "ibsso" | "oauth";

const SMS_GATE_DEFAULT_BASE_URL = "https://api.sms-gate.app/3rdparty/v1";
const SMS_GATE_DEFAULT_ENDPOINT = "messages";

class SmsManager {
  private normalizePhoneForSms(phone: string): string {
    const raw = phone.trim();
    if (!raw) {
      return raw;
    }

    if (raw.startsWith("+")) {
      return raw;
    }

    // Convert 00-prefixed international numbers to +.
    if (raw.startsWith("00")) {
      return `+${raw.slice(2)}`;
    }

    // Keep only digits for normalization.
    let digitsOnly = raw.replace(/\D/g, "");
    if (!digitsOnly) {
      return raw;
    }

    const defaultCountry = (process.env.SMS_DEFAULT_COUNTRY_CODE ?? "56").trim();
    if (!defaultCountry) {
      return `+${digitsOnly}`;
    }

    // Enforce Chile mobile format if configured.
    if ((process.env.SMS_ENFORCE_CHILE_MOBILE ?? "").toLowerCase() === "true") {
      if (defaultCountry !== "56") {
        throw new Error("SMS_ENFORCE_CHILE_MOBILE requires SMS_DEFAULT_COUNTRY_CODE=56");
      }

      // Normalize to +569XXXXXXXX.
      if (digitsOnly.length === 10 && digitsOnly.startsWith("09")) {
        digitsOnly = digitsOnly.slice(1);
      }

      if (digitsOnly.length === 9 && digitsOnly.startsWith("9")) {
        return `+56${digitsOnly}`;
      }

      if (digitsOnly.length === 11 && digitsOnly.startsWith("569")) {
        return `+${digitsOnly}`;
      }

      throw new Error(`Invalid Chile mobile number format: ${phone}`);
    }

    // Chile-specific normalization: mobile numbers are +56 9XXXXXXXX.
    if (defaultCountry === "56") {
      // If number is like 09XXXXXXXX, drop the leading 0.
      if (digitsOnly.length === 10 && digitsOnly.startsWith("09")) {
        digitsOnly = digitsOnly.slice(1);
      }

      // If it's a 9-digit mobile number starting with 9, prepend +56.
      if (digitsOnly.length === 9 && digitsOnly.startsWith("9")) {
        return `+56${digitsOnly}`;
      }
    }

    // If the number already includes the country code, just prefix "+".
    if (digitsOnly.startsWith(defaultCountry)) {
      return `+${digitsOnly}`;
    }

    return `+${defaultCountry}${digitsOnly}`;
  }
  private isSmsGateTemplate(urlTemplate: string): boolean {
    const normalized = urlTemplate.trim().toLowerCase();
    return normalized.startsWith("sms-gate://") || normalized.startsWith("smsgate://");
  }

  private isInfobipTemplate(urlTemplate: string): boolean {
    const normalized = urlTemplate.trim().toLowerCase();
    return normalized.startsWith("infobip://") || normalized.startsWith("infobip+");
  }

  private hasTemplateTokens(urlTemplate: string): boolean {
    return /\{(phone|phone_raw|message|message_raw)\}/i.test(urlTemplate);
  }

  private isHttpUrl(urlTemplate: string): boolean {
    const normalized = urlTemplate.trim().toLowerCase();
    return normalized.startsWith("http://") || normalized.startsWith("https://");
  }

  private buildUrl(urlTemplate: string, phone: string, message: string): string {
    const phoneEncoded = encodeURIComponent(phone);
    const messageEncoded = encodeURIComponent(message);

    return urlTemplate
      .replaceAll("{phone_raw}", phone)
      .replaceAll("{message_raw}", message)
      .replaceAll("{phone}", phoneEncoded)
      .replaceAll("{message}", messageEncoded);
  }

  private extractSmsGateDeviceId(parsed: URL): string | undefined {
    if (parsed.hostname) {
      return parsed.hostname;
    }

    const fromPath = parsed.pathname.replace(/^\/+/, "");
    if (fromPath) {
      return fromPath;
    }

    const fromQuery = parsed.searchParams.get("deviceId") ?? undefined;
    return fromQuery || undefined;
  }

  private normalizeBaseUrl(rawBaseUrl?: string | null): string {
    const base = (rawBaseUrl ?? "").trim() || SMS_GATE_DEFAULT_BASE_URL;
    return base.replace(/\/+$/, "");
  }

  private normalizeEndpoint(rawEndpoint?: string | null): string {
    const endpoint = (rawEndpoint ?? "").trim().replace(/^\/+/, "");
    if (!endpoint) {
      return SMS_GATE_DEFAULT_ENDPOINT;
    }
    return endpoint;
  }

  private buildSmsGateMessagesUrl(
    baseUrl: string,
    endpoint: string,
    query: URLSearchParams
  ): string {
    const queryString = query.toString();
    if (!queryString) {
      return `${baseUrl}/${endpoint}`;
    }
    return `${baseUrl}/${endpoint}?${queryString}`;
  }

  private resolveInfobipAuthType(parsed: URL): InfobipAuthType | undefined {
    const protocol = parsed.protocol.replace(":", "").toLowerCase();
    const plusIndex = protocol.indexOf("+");
    const schemeSuffix = plusIndex >= 0 ? protocol.slice(plusIndex + 1) : "";

    const resolveFromString = (value: string | null | undefined): InfobipAuthType | undefined => {
      const normalized = (value ?? "").trim().toLowerCase();
      if (!normalized) return undefined;
      if (normalized === "basic") return "basic";
      if (normalized === "apikey" || normalized === "api-key" || normalized === "app") return "apikey";
      if (normalized === "ibsso") return "ibsso";
      if (normalized === "oauth" || normalized === "bearer") return "oauth";
      return undefined;
    };

    const fromScheme = resolveFromString(schemeSuffix);
    if (fromScheme) return fromScheme;

    const fromQuery = resolveFromString(parsed.searchParams.get("auth"));
    if (fromQuery) return fromQuery;

    const fromEnv = resolveFromString(
      process.env.INFOBIP_AUTH_TYPE ?? process.env.SMS_INFOBIP_AUTH_TYPE
    );
    if (fromEnv) return fromEnv;

    return undefined;
  }

  private resolveInfobipBaseUrl(parsed: URL): string {
    const scheme = (parsed.searchParams.get("scheme") ?? "https").trim().toLowerCase();
    const host = parsed.host?.trim();

    if (host) {
      return `${scheme}://${host}`.replace(/\/+$/, "");
    }

    const baseEnv =
      parsed.searchParams.get("baseUrl") ??
      process.env.INFOBIP_BASE_URL ??
      process.env.SMS_INFOBIP_BASE_URL;

    if (!baseEnv) {
      throw new Error("Missing INFOBIP_BASE_URL for Infobip SMS");
    }

    let base = baseEnv.trim();
    if (!/^https?:\/\//i.test(base)) {
      base = `https://${base}`;
    }
    return base.replace(/\/+$/, "");
  }

  private resolveInfobipEndpoint(parsed: URL): string {
    const endpointParam = parsed.searchParams.get("endpoint");
    if (endpointParam) {
      return endpointParam.trim().replace(/^\/+/, "");
    }

    const path = parsed.pathname.trim().replace(/\/+$/, "");
    if (path && path !== "/") {
      return path.replace(/^\/+/, "");
    }

    const envEndpoint =
      process.env.INFOBIP_ENDPOINT ??
      process.env.SMS_INFOBIP_ENDPOINT ??
      "sms/2/text/advanced";
    return envEndpoint.trim().replace(/^\/+/, "");
  }

  private resolveInfobipSender(parsed: URL): string {
    const sender =
      parsed.searchParams.get("from") ??
      parsed.searchParams.get("sender") ??
      process.env.INFOBIP_SENDER ??
      process.env.SMS_INFOBIP_SENDER ??
      "";

    const trimmed = sender.trim();
    if (!trimmed) {
      throw new Error("Missing INFOBIP_SENDER for Infobip SMS");
    }

    return trimmed;
  }

  private resolveInfobipAuthHeader(parsed: URL, authType: InfobipAuthType): string {
    if (authType === "basic") {
      const username =
        parsed.searchParams.get("username") ??
        parsed.searchParams.get("user") ??
        process.env.INFOBIP_USERNAME ??
        process.env.SMS_INFOBIP_USERNAME ??
        "";
      const password =
        parsed.searchParams.get("password") ??
        process.env.INFOBIP_PASSWORD ??
        process.env.SMS_INFOBIP_PASSWORD ??
        "";
      if (!username || !password) {
        throw new Error("Missing INFOBIP_USERNAME/INFOBIP_PASSWORD for Basic auth");
      }
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      return `Basic ${encoded}`;
    }

    const token =
      parsed.searchParams.get("token") ??
      parsed.searchParams.get("apiKey") ??
      parsed.searchParams.get("key") ??
      (authType === "apikey"
        ? process.env.INFOBIP_API_KEY ?? process.env.SMS_INFOBIP_API_KEY
        : authType === "ibsso"
        ? process.env.INFOBIP_IBSSO_TOKEN ?? process.env.SMS_INFOBIP_IBSSO_TOKEN
        : process.env.INFOBIP_OAUTH_TOKEN ?? process.env.SMS_INFOBIP_OAUTH_TOKEN) ??
      "";

    if (!token) {
      throw new Error(`Missing Infobip token for auth type: ${authType}`);
    }

    if (authType === "apikey") {
      return `App ${token.trim()}`;
    }
    if (authType === "ibsso") {
      return `IBSSO ${token.trim()}`;
    }
    return `Bearer ${token.trim()}`;
  }

  private buildSmsGateAuthHeader(): string {
    const token = process.env.SMS_GATE_TOKEN?.trim();
    if (token) {
      return `Bearer ${token}`;
    }

    const username = process.env.SMS_GATE_USERNAME?.trim();
    const password = process.env.SMS_GATE_PASSWORD?.trim();
    if (!username || !password) {
      throw new Error(
        "Missing SMS Gate credentials. Set SMS_GATE_TOKEN or SMS_GATE_USERNAME and SMS_GATE_PASSWORD."
      );
    }

    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${encoded}`;
  }

  private parseSmsGateSimNumber(params: URLSearchParams): number | undefined {
    const simNumberRaw = params.get("simNumber");
    if (!simNumberRaw) {
      return undefined;
    }

    const simNumber = Number(simNumberRaw);
    if (!Number.isFinite(simNumber)) {
      throw new Error(`Invalid simNumber value: ${simNumberRaw}`);
    }

    return simNumber;
  }

  private async executeInfobip(
    urlTemplate: string,
    phone: string,
    message: string
  ): Promise<SmsSendResult> {
    let parsed: URL;
    try {
      parsed = new URL(urlTemplate.trim());
    } catch (error: any) {
      throw new Error(`Invalid Infobip template: ${error?.message ?? String(error)}`);
    }

    const authType =
      this.resolveInfobipAuthType(parsed) ??
      (process.env.INFOBIP_API_KEY || process.env.SMS_INFOBIP_API_KEY
        ? "apikey"
        : process.env.INFOBIP_USERNAME || process.env.SMS_INFOBIP_USERNAME
        ? "basic"
        : process.env.INFOBIP_IBSSO_TOKEN || process.env.SMS_INFOBIP_IBSSO_TOKEN
        ? "ibsso"
        : "oauth");

    const baseUrl = this.resolveInfobipBaseUrl(parsed);
    const endpoint = this.resolveInfobipEndpoint(parsed);
    const from = this.resolveInfobipSender(parsed);

    const url = `${baseUrl}/${endpoint}`;
    const authHeader = this.resolveInfobipAuthHeader(parsed, authType);

    const body = {
      messages: [
        {
          from,
          destinations: [{ to: phone }],
          text: message,
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: responseBody,
      url,
    };
  }

  private async executeSmsGate(
    urlTemplate: string,
    phone: string,
    message: string
  ): Promise<SmsSendResult> {
    let parsed: URL;
    try {
      parsed = new URL(urlTemplate);
    } catch (error: any) {
      throw new Error(`Invalid sms-gate template: ${error?.message ?? String(error)}`);
    }

    const deviceId = this.extractSmsGateDeviceId(parsed);

    const baseUrlParam = parsed.searchParams.get("baseUrl");
    const baseUrlEnv = process.env.SMS_GATE_BASE_URL;
    const baseUrl = this.normalizeBaseUrl(baseUrlParam ?? baseUrlEnv);

    const endpointParam = parsed.searchParams.get("endpoint");
    const endpointEnv = process.env.SMS_GATE_ENDPOINT;
    const endpoint = this.normalizeEndpoint(endpointParam ?? endpointEnv);

    const params = new URLSearchParams(parsed.search);
    params.delete("baseUrl");
    params.delete("deviceId");
    params.delete("endpoint");

    const simNumber = this.parseSmsGateSimNumber(params);
    params.delete("simNumber");

    const url = this.buildSmsGateMessagesUrl(baseUrl, endpoint, params);

    const body: Record<string, unknown> = {
      phoneNumbers: [phone],
      textMessage: { text: message },
    };

    if (deviceId) {
      body.deviceId = deviceId;
    }

    if (simNumber !== undefined) {
      body.simNumber = simNumber;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.buildSmsGateAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: responseBody,
      url,
    };
  }

  private async executeUrl(url: string): Promise<SmsSendResult> {
    const response = await fetch(url, { method: "GET" });
    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body,
      url,
    };
  }

  private shouldUseJsonPost(urlTemplate: string): boolean {
    if (!this.isHttpUrl(urlTemplate) || this.hasTemplateTokens(urlTemplate)) {
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(urlTemplate.trim());
    } catch {
      return false;
    }

    const methodParam = parsed.searchParams.get("method")?.toLowerCase();
    if (methodParam === "post") {
      return true;
    }

    const schemaParam = parsed.searchParams.get("schema")?.toLowerCase();
    if (schemaParam === "to-message" || schemaParam === "phone-message") {
      return true;
    }

    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path === "/") {
      return true;
    }

    return path.includes("send-sms");
  }

  private stripControlParams(url: URL): string {
    const params = new URLSearchParams(url.search);
    params.delete("method");
    params.delete("auth");
    params.delete("token");
    params.delete("bearer");
    params.delete("tokenKey");
    params.delete("authKey");
    params.delete("schema");
    params.delete("phoneKey");
    params.delete("toKey");
    params.delete("messageKey");
    const query = params.toString();
    const base = `${url.origin}${url.pathname}`;
    return query ? `${base}?${query}` : base;
  }

  private resolveJsonPostAuth(url: URL): string | undefined {
    const authMode = url.searchParams.get("auth")?.toLowerCase();
    if (authMode === "none" || authMode === "off" || authMode === "false") {
      return undefined;
    }

    const tokenParam =
      url.searchParams.get("token") ??
      url.searchParams.get("bearer");
    const tokenEnv =
      process.env.SMS_GATE_LOCAL_TOKEN?.trim() ??
      process.env.SMS_LOCAL_BEARER_TOKEN?.trim();
    const token = (tokenParam || tokenEnv || "").trim();

    if (!token) {
      return undefined;
    }

    if (authMode === "raw") {
      return token;
    }
    if (authMode === "token") {
      return `Token ${token}`;
    }

    return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  }

  private resolveBodyToken(url: URL): { key: string; token: string } | null {
    const authMode = url.searchParams.get("auth")?.toLowerCase();
    if (authMode !== "body") {
      return null;
    }

    const tokenParam =
      url.searchParams.get("token") ??
      url.searchParams.get("bearer");
    const tokenEnv =
      process.env.SMS_GATE_LOCAL_TOKEN?.trim() ??
      process.env.SMS_LOCAL_BEARER_TOKEN?.trim();
    const token = (tokenParam || tokenEnv || "").trim();
    if (!token) {
      return null;
    }

    const key = url.searchParams.get("tokenKey") ?? url.searchParams.get("authKey") ?? "token";
    return { key, token };
  }

  private resolveJsonPayloadKeys(url: URL): { phoneKey: string; messageKey: string } {
    const schema = url.searchParams.get("schema")?.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();

    let phoneKey = "phone";
    let messageKey = "message";

    if (schema === "to-message" || (!schema && (!path || path === "/"))) {
      phoneKey = "to";
    } else if (schema === "phone-message") {
      phoneKey = "phone";
    }

    const overridePhoneKey = url.searchParams.get("phoneKey");
    const overrideToKey = url.searchParams.get("toKey");
    const overrideMessageKey = url.searchParams.get("messageKey");

    if (overrideToKey) {
      phoneKey = overrideToKey;
    } else if (overridePhoneKey) {
      phoneKey = overridePhoneKey;
    }

    if (overrideMessageKey) {
      messageKey = overrideMessageKey;
    }

    return { phoneKey, messageKey };
  }

  private buildJsonPayload(url: URL, phone: string, message: string): Record<string, string> {
    const { phoneKey, messageKey } = this.resolveJsonPayloadKeys(url);
    const payload: Record<string, string> = {
      [phoneKey]: phone,
      [messageKey]: message,
    };

    const bodyToken = this.resolveBodyToken(url);
    if (bodyToken) {
      payload[bodyToken.key] = bodyToken.token;
    }

    return payload;
  }

  private async executeJsonPost(
    urlTemplate: string,
    phone: string,
    message: string
  ): Promise<SmsSendResult> {
    let parsed: URL;
    try {
      parsed = new URL(urlTemplate.trim());
    } catch (error: any) {
      throw new Error(`Invalid POST url: ${error?.message ?? String(error)}`);
    }

    const url = this.stripControlParams(parsed);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authHeader = this.resolveJsonPostAuth(parsed);
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(this.buildJsonPayload(parsed, phone, message)),
    });

    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body,
      url,
    };
  }

  async sendSms(lineId: string, phone: string, message: string): Promise<SmsSendResult> {
    const line = await storage.getGsmLine(lineId);
    if (!line) {
      throw new Error("GSM line not found");
    }
    if (!line.active) {
      throw new Error("GSM line is inactive");
    }

    return this.sendSmsWithLine(line, phone, message);
  }

  async sendSmsWithLine(line: GsmLine, phone: string, message: string): Promise<SmsSendResult> {
    if (!line.active) {
      throw new Error("GSM line is inactive");
    }

    const normalizedPhone = this.normalizePhoneForSms(phone);
    const template = line.urlTemplate.trim();

    let result: SmsSendResult;
    if (this.isSmsGateTemplate(template)) {
      result = await this.executeSmsGate(template, normalizedPhone, message);
    } else if (this.isInfobipTemplate(template)) {
      result = await this.executeInfobip(template, normalizedPhone, message);
    } else if (this.shouldUseJsonPost(template)) {
      result = await this.executeJsonPost(template, normalizedPhone, message);
    } else {
      result = await this.executeUrl(this.buildUrl(template, normalizedPhone, message));
    }

    if (!result.ok) {
      const trimmedBody = result.body.trim();
      const snippet = trimmedBody.length > 160 ? `${trimmedBody.slice(0, 160)}...` : trimmedBody;
      const suffix = snippet ? ` - ${snippet}` : "";
      throw new Error(`GSM HTTP ${result.status}${suffix}`);
    }

    return result;
  }
}

export const smsManager = new SmsManager();
