import { Client } from "minio";
import "dotenv/config";

// 1. USE THE BUCKET NAME FROM .ENV
export const BUCKET_NAME = process.env.MINIO_BUCKET || "e-office-files";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number.parseInt(process.env.MINIO_PORT, 10) || 9000,
  useSSL: String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

export const initMinio = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (exists) {
      console.log(`✅ MinIO connected. Bucket '${BUCKET_NAME}' ready.`);
    } else {
      await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
      console.log(`🪣  MinIO Bucket '${BUCKET_NAME}' created.`);
    }
  } catch (err) {
    console.error("❌ MinIO Connection Failed:", err.message);
  }
};
