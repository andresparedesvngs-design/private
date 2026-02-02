import "dotenv/config";
import mongoose from "mongoose";
import { smsManager } from "../server/smsManager";

const phone = process.argv[2];
const message = process.argv[3] ?? "info";
const lineName = process.argv[4] ?? "Infobip";
const countRaw = process.argv[5];
const overrideSender = process.argv[6] ?? "";

const count = Math.max(1, Number.parseInt(countRaw ?? "1", 10) || 1);

if (!phone) {
  console.error("Usage: node --loader tsx script/sendSmsTest.ts <phone> [message] [lineName]");
  process.exit(1);
}

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  await mongoose.connect(uri);

  const line = await mongoose.connection.collection("gsmlines").findOne({ name: lineName });
  if (!line) {
    throw new Error(`GSM line not found: ${lineName}`);
  }

  let urlTemplate = String(line.urlTemplate ?? "");
  if (overrideSender && urlTemplate.toLowerCase().startsWith("infobip")) {
    try {
      const parsed = new URL(urlTemplate);
      parsed.searchParams.set("from", overrideSender);
      urlTemplate = parsed.toString();
    } catch {
      // If parsing fails, keep the original template.
    }
  }

  const gsmLine = {
    id: String(line._id),
    name: line.name,
    urlTemplate,
    status: line.status,
    active: line.active,
    lastUsedAt: line.lastUsedAt ?? null,
  };

  const results = await Promise.all(
    Array.from({ length: count }).map(() =>
      smsManager.sendSmsWithLine(gsmLine as any, phone, message)
    )
  );

  console.log(
    "SMS_RESULT",
    results.map((result) => ({ ok: result.ok, status: result.status }))
  );

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("SMS_ERROR", error?.message ?? error);
  process.exit(1);
});
