import WorkflowService from "../services/workflow.service.js";
import MoveFileRequestDto from "../dtos/request/MoveFileRequestDto.js";
import AppError from "../../../utils/AppError.js";
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";
import fs from "node:fs";

class WorkflowController {
  async moveFile(req, res, next) {
    const attachments = req.files || [];

    try {
      const { id } = req.params; // File ID from URL
      const moveData = MoveFileRequestDto.validate(req.body);

      if (attachments.length > 10) {
        throw new AppError(
          "You can only attach a maximum of 10 files at a time.",
          400,
        );
      }

      const result = await WorkflowService.moveFile(
        id,
        moveData,
        req.user,
        attachments,
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      // Best-effort cleanup of temp files (disk storage path)
      for (const file of attachments) {
        const filePath = file?.path;
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore cleanup errors
          }
        }
      }

      if (attachments.length > 0) {
        await Promise.all(
          attachments.map(async (file) => {
            const key = file?.key;
            if (!key) return;
            try {
              await minioClient.removeObject(BUCKET_NAME, key);
            } catch (error_) {
              // ✅ FIXED: Renamed to error_
              console.error(
                "Failed to clean up MinIO object on error:",
                error_, // ✅ FIXED: Referenced new name
              );
            }
          }),
        );
      }

      next(error);
    }
  }
}

export default new WorkflowController();
