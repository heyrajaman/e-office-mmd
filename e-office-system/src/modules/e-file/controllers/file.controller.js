import FileService from "../services/file.service.js";
import CreateFileRequestDto from "../dtos/request/CreateFileRequestDto.js";
import AppError from "../../../utils/AppError.js";
// --- FIX: Import MinIO config and Path ---
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";
import path from "path";
class FileController {
  async createFile(req, res, next) {
    try {
      // 1. Check if file is present
      if (!req.files || !req.files["puc"]) {
        throw new AppError("PUC Document (Main PDF) is required", 400);
      }

      const pucFile = req.files["puc"][0]; // The Main File
      const attachmentFiles = req.files["attachments"] || []; // Array of extra files (can be empty)

      // 2. Validate Text Data
      const fileData = CreateFileRequestDto.validate(req.body);

      // 3. Call Service
      // We pass: Data, User (from token), File Buffer, and Original Name
      const newFile = await FileService.createFile(
        fileData,
        req.user,
        pucFile, // Pass the whole PUC object (buffer, name, mime)
        attachmentFiles, // Pass the array of attachments
      );

      // 4. Response
      res.status(201).json({
        success: true,
        message: "e-File created successfully",
        data: newFile,
      });
    } catch (error) {
      next(error);
    }
  }

  async getInbox(req, res, next) {
    try {
      // "req.user.id" comes from the 'protect' middleware (the token)
      const files = await FileService.getInbox(req.user.id);

      res.status(200).json({
        success: true,
        message: "Inbox fetched successfully",
        count: files.length,
        data: files,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOutbox(req, res, next) {
    try {
      const files = await FileService.getOutbox(req.user.id);
      res.status(200).json({
        success: true,
        message: "Outbox fetched successfully",
        count: files.length,
        data: files,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFileHistory(req, res, next) {
    try {
      const { id } = req.params; // Get file ID from URL
      const history = await FileService.getFileHistory(id);

      res.status(200).json({
        success: true,
        message: "File history fetched successfully",
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchFiles(req, res, next) {
    try {
      // Pass the entire query object (text, status, priority, etc.) to the service
      const files = await FileService.searchFiles(req.query);

      res.status(200).json({
        success: true,
        message: "Files searched successfully",
        count: files.length,
        data: files,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardStats(req, res, next) {
    try {
      const stats = await FileService.getDashboardStats(req.user.id);
      res.status(200).json({
        success: true,
        message: "Dashboard stats fetched successfully",
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

async downloadFile(req, res, next) {
    try {
      let { fileKey } = req.query;

      if (!fileKey) {
        throw new AppError("File key is required", 400);
      }

      // FIX 1: Explicitly decode the URL to ensure %2F becomes /
      fileKey = decodeURIComponent(fileKey);

      // FIX 2: Remove leading slash if present (MinIO doesn't like /files/...)
      if (fileKey.startsWith("/")) {
        fileKey = fileKey.substring(1);
      }

      // DEBUG LOG: This will print in your VS Code terminal. 
      // Compare this output with your MinIO browser path!
      console.log("📂 [DEBUG] Attempting Download:");
      console.log(`   - Bucket: '${BUCKET_NAME}'`);
      console.log(`   - FileKey: '${fileKey}'`);

      // Check if file exists in MinIO
      try {
        await minioClient.statObject(BUCKET_NAME, fileKey);
      } catch (err) {
        console.error("❌ [MinIO Error]:", err.message); // Print actual MinIO error
        throw new AppError(
          `File not found in bucket '${BUCKET_NAME}' at path: ${fileKey}`,
          404
        );
      }

      // Stream the file
      const dataStream = await minioClient.getObject(BUCKET_NAME, fileKey);
      const filename = path.basename(fileKey);
      
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");

      dataStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

}

export default new FileController();
