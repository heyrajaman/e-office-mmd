import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { BUCKET_NAME, minioClient } from "../../config/minio.js";

class StorageService {
  async uploadFileToMinIO(fileData, destinationPath) {
    const extension = path.extname(fileData.originalname || "");

    const uniqueSuffix = `${Date.now()}-${crypto.randomInt(0, 10000)}`;
    const objectName = `${destinationPath}/${uniqueSuffix}${extension}`;

    try {
      const fileStream = fs.createReadStream(fileData.path);
      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        fileStream,
        fileData.size,
      );
      return objectName;
    } finally {
      if (fileData?.path && fs.existsSync(fileData.path)) {
        fs.unlinkSync(fileData.path);
      }
    }
  }

  async uploadBufferToMinIO(fileData, destinationPath) {
    const extension = path.extname(fileData.originalname || "");

    const uniqueSuffix = `${Date.now()}-${crypto.randomInt(0, 10000)}`;
    const objectName = `${destinationPath}/${uniqueSuffix}${extension}`;

    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      fileData.buffer,
      fileData.size,
    );

    return objectName;
  }
}

export default new StorageService();
