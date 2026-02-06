import {
  sequelize,
  FileMaster,
  FileMovement,
  User,
  Designation,
} from "../../../database/models/index.js";
import {
  MOVEMENT_ACTIONS,
  ROLES,
  FILE_STATUS,
  DESIGNATIONS,
} from "../../../config/constants.js";
import AppError from "../../../utils/AppError.js";

class WorkflowService {
  async moveFile(fileId, moveData, currentUser) {
    if (currentUser?.system_role === ROLES.ADMIN) {
      throw new AppError("Admins are not allowed to move files.", 403);
    }

    const transaction = await sequelize.transaction();

    try {
      // 1. Find the File
      const file = await FileMaster.findByPk(fileId);
      if (!file) {
        throw new AppError("File not found", 404);
      }

      // 2. Security Check: Do I actually hold this file?
      if (file.current_holder_id !== currentUser.id) {
        throw new AppError(
          "You do not have permission to move this file. You are not the current holder.",
          403,
        );
      }

      // --- NEW: FETCH RECEIVER DETAILS ---
      const receiver = await User.findByPk(moveData.receiverId, {
        include: [{ model: Designation, as: "designation" }],
      });
      if (!receiver) {
        throw new AppError("Receiver not found", 404);
      }

      // --- NEW: HIERARCHY RULE 1 (Staff cannot skip to President) ---
      if (currentUser.system_role === ROLES.STAFF) {
        if (
          receiver.designation &&
          receiver.designation.name === DESIGNATIONS.PRESIDENT
        ) {
          throw new AppError(
            "Hierarchy Violation: Staff members cannot send files directly to the President. Please route through a Board Member.",
            403,
          );
        }
      }

      // --- NEW: HIERARCHY RULE 2 (Cannot send to self) ---
      if (
        currentUser.id === receiver.id &&
        moveData.action === MOVEMENT_ACTIONS.FORWARD
      ) {
        // Note: We allow sending to self if it's 'APPROVE' (sometimes acts as a self-close),
        // but typically FORWARD to self is useless.
        throw new AppError("You cannot forward a file to yourself.", 400);
      }

      // 3. Role Validation Check
      // If action is APPROVE or REJECT, allow only ADMIN or BOARD_MEMBER
      if (
        moveData.action === MOVEMENT_ACTIONS.APPROVE ||
        moveData.action === MOVEMENT_ACTIONS.REJECT
      ) {
        const allowedRoles = [ROLES.ADMIN, ROLES.BOARD_MEMBER];
        if (!allowedRoles.includes(currentUser.system_role)) {
          throw new AppError(
            `Staff members cannot perform ${moveData.action}. You can only FORWARD or REVERT.`,
            403,
          );
        }
      }

      // --- NEW: SECURITY PIN CHECK ---
      // We only demand a PIN for high-security actions (Approve/Reject)
      const sensitiveActions = [
        MOVEMENT_ACTIONS.APPROVE,
        MOVEMENT_ACTIONS.REJECT,
      ];

      if (sensitiveActions.includes(moveData.action)) {
        // A. Check if PIN was sent in the request body
        if (!moveData.pin) {
          throw new AppError("Security PIN is required for this action.", 400);
        }

        // B. Verify the PIN using the User Model method we created
        const isPinValid = await currentUser.validatePin(moveData.pin);

        if (!isPinValid) {
          throw new AppError("Invalid Security PIN.", 403);
        }
      }

      // --- NEW: AUTO-UPDATE STATUS ---
      let newStatus = file.status;

      switch (moveData.action) {
        case MOVEMENT_ACTIONS.APPROVE:
          newStatus = FILE_STATUS.APPROVED;
          break;
        case MOVEMENT_ACTIONS.REJECT:
          newStatus = FILE_STATUS.REJECTED;
          break;
        case MOVEMENT_ACTIONS.REVERT:
          newStatus = FILE_STATUS.REVERTED;
          break;
        case MOVEMENT_ACTIONS.FORWARD:
          // If it was DRAFT, now it is IN_PROGRESS
          if (file.status === FILE_STATUS.DRAFT) {
            newStatus = FILE_STATUS.IN_PROGRESS;
          }
          // If it was REVERTED, and we fix & forward, it becomes IN_PROGRESS again
          if (file.status === FILE_STATUS.REVERTED) {
            newStatus = FILE_STATUS.IN_PROGRESS;
          }
          break;
      }

      // 4. Update Current Holder
      file.current_holder_id = moveData.receiverId;
      file.status = newStatus;

      await file.save({ transaction });

      // 5. Create Audit Trail (History)
      await FileMovement.create(
        {
          file_id: file.id,
          sent_by: currentUser.id,
          sent_to: moveData.receiverId,
          action: moveData.action,
          remarks: moveData.remarks,
          is_read: false,
        },
        { transaction },
      );

      // 6. Commit Transaction
      await transaction.commit();

      return {
        message: "File moved successfully",
        newHolderId: moveData.receiverId,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default new WorkflowService();
