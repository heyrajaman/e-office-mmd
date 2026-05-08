import path from "node:path";
import fileService from "../../e-file/services/file.service.js";
import {
  sequelize,
  FileMovement,
  FileAttachment,
  User,
  Designation,
} from "../../../database/models/index.js";
import {
  MOVEMENT_ACTIONS,
  ROLES,
  DESIGNATIONS,
} from "../../../config/constants.js";
import AppError from "../../../utils/AppError.js";
import bcrypt from "bcryptjs";
import eventBus, { EVENTS } from "../../../events/eventBus.js";
import storageService from "../../storage/storage.service.js";
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";

class WorkflowService {
  async moveFile(fileId, moveData, currentUser, attachments = []) {
    // Pre-checks (no transaction): fail fast before any slow uploads.
    const file = await this._validateFileAndPermissions(fileId, currentUser);

    if (moveData.action === MOVEMENT_ACTIONS.FORWARD) {
      await this._validateForwardingCredentials(moveData, currentUser);
      // Align in-memory state for forwarding rules checks.
      file.is_verified = true;
    }

    const receiver = await this._getAndValidateReceiver(
      moveData.receiverId,
      currentUser,
    );

    await this._validateForwardingRules(moveData, currentUser, file, receiver);

    // Upload attachments first to avoid long-running DB transactions.
    const uploadedAttachments = attachments?.length
      ? await this._uploadAttachmentsToStorage(attachments, fileId)
      : [];

    const transaction = await sequelize.transaction();
    try {
      if (moveData.action === MOVEMENT_ACTIONS.FORWARD) {
        await fileService.markFileVerified(fileId, currentUser.id, transaction);
      }

      await fileService.updateFileLocation(
        fileId,
        moveData.receiverId,
        transaction,
      );

      const movement = await this._createAuditTrail(
        file,
        moveData,
        currentUser,
        transaction,
      );

      if (uploadedAttachments.length) {
        const rows = uploadedAttachments.map((att) => ({
          ...att,
          file_id: file.id,
          movement_id: movement.id,
        }));

        await FileAttachment.bulkCreate(rows, { transaction });
      }

      await transaction.commit();

      eventBus.emit(EVENTS.FILE_MOVED, {
        receiverId: moveData.receiverId,
        fileId: file.id,
        action: moveData.action,
        senderId: currentUser.id,
      });

      return {
        message: "File moved successfully",
        newHolderId: moveData.receiverId,
      };
    } catch (error) {
      await transaction.rollback();

      // Best-effort cleanup: if DB failed after uploading, delete the uploaded objects.
      if (uploadedAttachments?.length) {
        await Promise.all(
          uploadedAttachments.map(async (att) => {
            try {
              await minioClient.removeObject(BUCKET_NAME, att.file_key);
            } catch {
              // best-effort
            }
          }),
        );
      }

      throw error;
    }
  }

  async _validateFileAndPermissions(fileId, currentUser, transaction = null) {
    const file = await fileService.getFileOrThrow(fileId, transaction);

    if (
      file.current_designation_id !== currentUser.designation_id ||
      file.current_department_id !== currentUser.department_id
    ) {
      throw new AppError("You do not have permission to move this file.", 403);
    }

    return file;
  }

  async _validateForwardingCredentials(moveData, currentUser) {
    if (!currentUser.signature_url) {
      throw new AppError(
        "Digital Signature is missing. Please ask Admin to upload your signature before forwarding files.",
        403,
      );
    }

    if (!currentUser.security_pin) {
      throw new AppError(
        "Security PIN not created. Please set up your PIN in profile settings first.",
        400,
      );
    }

    if (!moveData.pin) {
      throw new AppError("Security PIN is required to forward this file.", 400);
    }

    const isPinValid = await bcrypt.compare(
      moveData.pin,
      currentUser.security_pin,
    );
    if (!isPinValid) {
      throw new AppError("Invalid Security PIN.", 400);
    }
  }

  async _getAndValidateReceiver(receiverId, currentUser) {
    const receiver = await User.findByPk(receiverId, {
      include: [{ model: Designation, as: "designation" }],
    });

    if (!receiver) {
      throw new AppError("Receiver not found", 404);
    }

    if (receiver.id === currentUser.id) {
      throw new AppError("You cannot send or move a file to yourself.", 400);
    }

    return receiver;
  }

  async _validateForwardingRules(moveData, currentUser, file, receiver) {
    const isReceiverPresident =
      receiver.designation?.name === DESIGNATIONS.PRESIDENT;
    const isAdmin = currentUser.system_role === ROLES.ADMIN;

    if (
      currentUser.system_role === ROLES.STAFF &&
      isReceiverPresident &&
      !isAdmin
    ) {
      throw new AppError(
        "Hierarchy Violation: Staff cannot send files directly to the President.",
        403,
      );
    }

    const isSenderPresident =
      currentUser.designation?.name === DESIGNATIONS.PRESIDENT;

    if (isReceiverPresident && !file.is_verified) {
      throw new AppError(
        "Verification Required: You must VERIFY this file before forwarding to the President.",
        400,
      );
    }

    if (isSenderPresident && !file.is_verified) {
      throw new AppError(
        "Verification Required: President must verify before forwarding.",
        400,
      );
    }
  }

  async _createAuditTrail(file, moveData, currentUser, transaction) {
    return await FileMovement.create(
      {
        file_id: file.id,
        sent_by: currentUser.id,
        sent_by_designation_id: currentUser.designation_id,
        sent_by_department_id: currentUser.department_id,
        sent_to: moveData.receiverId,
        action: moveData.action,
        remarks: moveData.remarks,
        is_read: false,
        signature_snapshot: currentUser.signature_url,
      },
      { transaction },
    );
  }

  async _uploadAttachmentsToStorage(attachments, fileId) {
    const uploadDestinationPath = `files/file-${fileId}/attachments`;

    const uploaded = await Promise.all(
      attachments.map(async (attachment) => {
        const attachmentExtension =
          path.extname(attachment.originalname || "") || ".pdf";
        const originalName =
          attachment.originalname || `attachment${attachmentExtension}`;

        const objectKey = attachment?.path
          ? await storageService.uploadFileToMinIO(
              attachment,
              uploadDestinationPath,
            )
          : null;

        if (!objectKey) {
          throw new AppError(
            "Attachment upload failed: missing uploaded file path.",
            500,
          );
        }

        return {
          original_name: originalName,
          file_key: objectKey,
          file_url: objectKey,
          mime_type: attachment.mimetype,
          file_size: attachment.size,
        };
      }),
    );

    return uploaded;
  }
}

export default new WorkflowService();
