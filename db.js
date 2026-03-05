import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

let db;

export async function connectDB() {
  try {
    await client.connect();
    db = client.db("samsystem");
    console.log("MongoDB Atlas Connected ✅");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

export function getDB() {
  return db;
}