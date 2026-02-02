import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/whatsapp_campaigns";

let connectPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

  connectPromise = mongoose
    .connect(uri)
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

