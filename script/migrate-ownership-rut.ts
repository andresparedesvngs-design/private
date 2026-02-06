import mongoose from "mongoose";
import { connectDatabase } from "../server/db";
import { storage } from "../server/storage";
import {
  CampaignModel,
  ContactModel,
  DebtorModel,
  UserModel,
} from "../shared/schema";

type Args = {
  defaultUserId?: string;
  defaultUsername?: string;
  dryRun: boolean;
};

const parseArgs = (): Args => {
  const args: Args = { dryRun: false };
  const raw = process.argv.slice(2);

  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry) continue;

    if (entry === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    const [key, valueFromEq] = entry.split("=");
    const value = valueFromEq ?? raw[i + 1];

    if (key === "--default-user-id") {
      args.defaultUserId = value;
      if (!valueFromEq) i += 1;
      continue;
    }

    if (key === "--default-username") {
      args.defaultUsername = value;
      if (!valueFromEq) i += 1;
      continue;
    }
  }

  return args;
};

const normalizePhone = (phone: string): string =>
  String(phone ?? "").replace(/@c\.us$/i, "").replace(/\D/g, "");

const hasMeaningfulRut = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  return trimmed.toUpperCase() !== "UNKNOWN";
};

const resolveDefaultOwner = async (args: Args) => {
  if (args.defaultUserId) {
    const user = await UserModel.findById(args.defaultUserId);
    return user ?? null;
  }

  if (args.defaultUsername) {
    const user = await UserModel.findOne({ username: args.defaultUsername });
    return user ?? null;
  }

  const admin = await UserModel.findOne({ role: "admin", active: true }).sort({
    createdAt: 1,
  });
  if (admin) return admin;

  const supervisor = await UserModel.findOne({
    role: "supervisor",
    active: true,
  }).sort({ createdAt: 1 });
  return supervisor ?? null;
};

const findContactRut = async (phone: string): Promise<string | null> => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const byNormalized = await ContactModel.findOne({
    phoneNormalized: normalized,
  }).select("rut");
  if (byNormalized && hasMeaningfulRut(byNormalized.rut)) {
    return String(byNormalized.rut).trim();
  }

  const suffix = normalized.slice(-8);
  if (!suffix) return null;
  const regex = new RegExp(`${suffix}(\\D.*)?$`, "i");
  const byPhone = await ContactModel.findOne({
    phone: { $regex: regex },
  }).select("rut");
  if (byPhone && hasMeaningfulRut(byPhone.rut)) {
    return String(byPhone.rut).trim();
  }

  return null;
};

const run = async () => {
  const args = parseArgs();
  await connectDatabase();

  const defaultOwner = await resolveDefaultOwner(args);
  if (!defaultOwner) {
    throw new Error(
      "No hay admin/supervisor activo. Usa --default-user-id o --default-username."
    );
  }

  if (!["admin", "supervisor"].includes(defaultOwner.role)) {
    throw new Error(
      "El usuario por defecto debe ser admin o supervisor."
    );
  }

  if (!defaultOwner.active) {
    throw new Error("El usuario por defecto debe estar activo.");
  }

  const defaultOwnerId = defaultOwner._id.toString();
  const campaignFilter = {
    $or: [{ ownerUserId: null }, { ownerUserId: { $exists: false } }],
  };
  const campaignTargetCount = await CampaignModel.countDocuments(campaignFilter);

  let campaignsUpdated = 0;
  if (!args.dryRun) {
    const result = await CampaignModel.updateMany(campaignFilter, {
      $set: { ownerUserId: defaultOwner._id },
    });
    campaignsUpdated = result.modifiedCount || 0;
  } else {
    campaignsUpdated = campaignTargetCount;
  }

  const campaignOwners = await CampaignModel.find()
    .select("_id ownerUserId")
    .lean();
  const campaignOwnerById = new Map<string, string | null>();
  for (const campaign of campaignOwners) {
    campaignOwnerById.set(
      String(campaign._id),
      campaign.ownerUserId ? String(campaign.ownerUserId) : null
    );
  }

  const debtorFilter = {
    $or: [{ ownerUserId: null }, { ownerUserId: { $exists: false } }],
  };
  const debtorCursor = DebtorModel.find(debtorFilter)
    .select("_id campaignId")
    .cursor();

  let debtorsAssignedFromCampaign = 0;
  let debtorsAssignedDefault = 0;
  let debtorsOwnerUnknown = 0;
  const ownerOps: Array<any> = [];

  for await (const debtor of debtorCursor) {
    const campaignId = debtor.campaignId ? String(debtor.campaignId) : null;
    const ownerFromCampaign = campaignId
      ? campaignOwnerById.get(campaignId) ?? null
      : null;
    const targetOwnerId = ownerFromCampaign || defaultOwnerId;

    if (!targetOwnerId) {
      debtorsOwnerUnknown += 1;
      continue;
    }

    ownerOps.push({
      updateOne: {
        filter: { _id: debtor._id },
        update: { $set: { ownerUserId: new mongoose.Types.ObjectId(targetOwnerId) } },
      },
    });

    if (ownerFromCampaign) {
      debtorsAssignedFromCampaign += 1;
    } else {
      debtorsAssignedDefault += 1;
    }

    if (ownerOps.length >= 500) {
      if (!args.dryRun) {
        await DebtorModel.bulkWrite(ownerOps);
      }
      ownerOps.length = 0;
    }
  }

  if (ownerOps.length > 0) {
    if (!args.dryRun) {
      await DebtorModel.bulkWrite(ownerOps);
    }
  }

  const rutFilter = {
    $or: [
      { rut: null },
      { rut: { $exists: false } },
      { rut: "" },
      { rut: "UNKNOWN" },
    ],
  };

  const rutCursor = DebtorModel.find(rutFilter)
    .select("_id phone rut")
    .cursor();

  let rutUpdatedFromContact = 0;
  let rutSetUnknown = 0;
  const rutOps: Array<any> = [];

  for await (const debtor of rutCursor) {
    if (hasMeaningfulRut(debtor.rut)) {
      continue;
    }

    const contactRut = await findContactRut(debtor.phone);
    const nextRut = contactRut ?? "UNKNOWN";

    rutOps.push({
      updateOne: {
        filter: { _id: debtor._id },
        update: { $set: { rut: nextRut } },
      },
    });

    if (contactRut) {
      rutUpdatedFromContact += 1;
    } else {
      rutSetUnknown += 1;
    }

    if (rutOps.length >= 500) {
      if (!args.dryRun) {
        await DebtorModel.bulkWrite(rutOps);
      }
      rutOps.length = 0;
    }
  }

  if (rutOps.length > 0) {
    if (!args.dryRun) {
      await DebtorModel.bulkWrite(rutOps);
    }
  }

  await storage.createSystemLog({
    level: "info",
    source: "migration",
    message: "Ownership and RUT migration completed",
    metadata: {
      dryRun: args.dryRun,
      defaultOwnerId: defaultOwnerId,
      defaultOwnerUsername: defaultOwner.username,
      campaignsTargeted: campaignTargetCount,
      campaignsUpdated,
      debtorsAssignedFromCampaign,
      debtorsAssignedDefault,
      debtorsOwnerUnknown,
      rutUpdatedFromContact,
      rutSetUnknown,
    },
  });

  console.log("Migration finished.");
  console.log({
    dryRun: args.dryRun,
    defaultOwnerId,
    defaultOwnerUsername: defaultOwner.username,
    campaignsTargeted: campaignTargetCount,
    campaignsUpdated,
    debtorsAssignedFromCampaign,
    debtorsAssignedDefault,
    debtorsOwnerUnknown,
    rutUpdatedFromContact,
    rutSetUnknown,
  });
};

run()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
