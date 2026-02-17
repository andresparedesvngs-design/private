import mongoose from "mongoose";
import {
  DEFAULT_MONGO_URI,
  getMongoUriOrDefault,
  isProductionEnv,
} from "./env";

let connectPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const configuredUri = getMongoUriOrDefault();
  const usingDefaultLocalMongo = configuredUri === DEFAULT_MONGO_URI;
  if (isProductionEnv() && usingDefaultLocalMongo) {
    console.warn(
      "[db] Using default local MongoDB URI in production. Set MONGO_URI (or MONGODB_URI) for remote/local managed DB."
    );
  }

  connectPromise = mongoose
    .connect(configuredUri)
    .then((conn) => {
      console.log("MongoDB connected");
      return conn;
    })
    .catch((err) => {
      connectPromise = null;
      console.error("MongoDB connection error:", err);
      throw err;
    });

  return connectPromise;
}
