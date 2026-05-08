import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

// Create the Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

// Event listeners for debugging
redisClient.on("connect", () => {
  console.log("✅ Redis Client Connected Successfully");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

// Immediately invoked async function to connect

try {
  await redisClient.connect();
} catch (error) {
  console.error("Failed to connect to Redis:", error);
}

export default redisClient;
