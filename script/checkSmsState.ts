import dotenv from "dotenv";
dotenv.config();

import { connectDatabase } from "../server/db";
import {
  GsmLineModel,
  GsmPoolModel,
  CampaignModel,
  DebtorModel,
  MessageModel,
} from "../shared/schema";

async function run() {
  await connectDatabase();

  const [lines, pools, campaigns, debtors, recentMessages] = await Promise.all([
    GsmLineModel.find().sort({ createdAt: -1 }).limit(5).lean(),
    GsmPoolModel.find().sort({ createdAt: -1 }).limit(5).lean(),
    CampaignModel.find().sort({ createdAt: -1 }).limit(10).lean(),
    DebtorModel.find().sort({ createdAt: -1 }).limit(20).lean(),
    MessageModel.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  console.log("GSM_LINES", lines.map((l) => ({
    id: String(l._id),
    name: l.name,
    active: l.active,
    urlTemplate: l.urlTemplate,
  })));

  console.log("GSM_POOLS", pools.map((p) => ({
    id: String(p._id),
    name: p.name,
    lineIds: (p.lineIds ?? []).map((id: any) => String(id)),
    active: p.active,
  })));

  console.log("CAMPAIGNS", campaigns.map((c) => ({
    id: String(c._id),
    name: c.name,
    channel: c.channel,
    smsPoolId: c.smsPoolId ? String(c.smsPoolId) : null,
    status: c.status,
  })));

  console.log("DEBTORS", debtors.map((d) => ({
    id: String(d._id),
    campaignId: d.campaignId ? String(d.campaignId) : null,
    name: d.name,
    phone: d.phone,
    status: d.status,
  })));

  console.log("RECENT_MESSAGES", recentMessages.map((m) => ({
    id: String(m._id),
    channel: m.channel,
    status: m.status,
    phone: m.phone,
    error: m.error,
    createdAt: m.createdAt,
  })));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
