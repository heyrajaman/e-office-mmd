import fs from "fs/promises";
import { Op } from "sequelize";
import path from "path";
import {
  sequelize,
  FileMaster,
  FileMovement,
  FileAttachment,
  User,
  Department,
  Designation, // Ensure Designation is imported
} from "../../../database/models/index.js";
import { FILE_STATUS, ROLES, DESIGNATIONS } from "../../../config/constants.js";
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";
import AppError from "../../../utils/AppError.js";
import FileResponseDto from "../dtos/response/FileResponseDto.js";

const encodeCursor = (data) => {
  return Buffer.from(JSON.stringify(data)).toString("base64");
};

const decodeCursor = (cursor) => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch (e) {
    return null;
  }
};

class FileService {
  async createFile(fileData, user, pucFile, attachments) {
    const transaction = await sequelize.transaction();

    try {
      const year = new Date().getFullYear();
      const department = await Department.findByPk(user.department_id);
      const deptCode = department.name.substring(0, 3).toUpperCase();

      const count = await FileMaster.count({
        where: { department_id: user.department_id },
        transaction,
      });
      const runningNo = String(count + 1).padStart(3, "0");
      const fileNumber = `MMD/${deptCode}/${runningNo}/${year}`;

      // Upload PUC
      const pucTimestamp = Date.now();
      const pucExt = path.extname(pucFile.originalname);
      const pucUniqueSuffix = `${pucTimestamp}-${Math.round(Math.random() * 1e4)}`;
      const pucObjectName = `files/${year}/${deptCode}/${pucUniqueSuffix}${pucExt}`;

      await minioClient.fPutObject(BUCKET_NAME, pucObjectName, pucFile.path, {
        "Content-Type": pucFile.mimetype,
      });

      // Save File
      const newFile = await FileMaster.create(
        {
          file_number: fileNumber,
          subject: fileData.subject,
          description: fileData.description,
          priority: fileData.priority,
          type: fileData.type,
          status: FILE_STATUS.DRAFT,
          puc_url: pucObjectName,
          original_filename: pucFile.originalname,
          mime_type: pucFile.mimetype,
          created_by: user.id,
          department_id: user.department_id,

          // 🚨 Position-Based Fields
          current_holder_id: user.id,
          current_designation_id: user.designation_id,
          current_department_id: user.department_id,

          is_verified: false,
          verified_by: null,
          verified_at: null,
        },
        { transaction },
      );

      // Save Attachments
      if (attachments && attachments.length > 0) {
        await Promise.all(
          attachments.map(async (file) => {
            const attExt = path.extname(file.originalname);
            const attSuffix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
            const attObjectName = `files/${year}/${deptCode}/attachments/${attSuffix}${attExt}`;

            await minioClient.fPutObject(
              BUCKET_NAME,
              attObjectName,
              file.path,
              {
                "Content-Type": file.mimetype,
              },
            );

            return FileAttachment.create(
              {
                file_id: newFile.id,
                original_name: file.originalname,
                file_key: attObjectName,
                file_url: attObjectName,
                mime_type: file.mimetype,
                file_size: file.size,
              },
              { transaction },
            );
          }),
        );
      }

      // Initial Movement Log
      await FileMovement.create(
        {
          file_id: newFile.id,
          sent_by: user.id,
          sent_by_designation_id: user.designation_id,
          sent_by_department_id: user.department_id,
          sent_to: user.id,
          action: "CREATED",
          remarks: "File Initiated / Draft Created",
          is_read: true,
        },
        { transaction },
      );

      await transaction.commit();

      await fs.unlink(pucFile.path).catch(console.error);
      if (attachments) {
        await Promise.all(
          attachments.map((f) => fs.unlink(f.path).catch(console.error)),
        );
      }

      await newFile.reload({
        include: [
          { model: Department, as: "department" },
          { model: User, as: "creator" },
          { model: FileAttachment, as: "attachments" },
          { model: Designation, as: "currentDesignation" },
          { model: Department, as: "currentDepartment" },
          { model: User, as: "currentHolder" },
        ],
      });

      return new FileResponseDto(newFile);
    } catch (error) {
      await transaction.rollback();

      if (pucFile && pucFile.path)
        await fs.unlink(pucFile.path).catch(console.error);
      if (attachments) {
        await Promise.all(
          attachments.map((f) => fs.unlink(f.path).catch(console.error)),
        );
      }
      throw error;
    }
  }

  async addAttachment(fileId, files, currentUser) {
    const fileMaster = await FileMaster.findByPk(fileId);
    if (!fileMaster) throw new AppError("File not found", 404);

    // Permission Check
    if (fileMaster.current_holder_id !== currentUser.id) {
      throw new AppError(
        "You can only add attachments to files you hold.",
        403,
      );
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new AppError("At least one attachment file is required.", 400);
    }

    const year = new Date().getFullYear();

    const createdAttachments = [];
    try {
      for (const file of files) {
        const attExt = path.extname(file.originalname);
        const attSuffix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
        const attObjectName = `files/${year}/attachments/${attSuffix}${attExt}`;

        await minioClient.fPutObject(BUCKET_NAME, attObjectName, file.path, {
          "Content-Type": file.mimetype,
        });

        const newAttachment = await FileAttachment.create({
          file_id: fileMaster.id,
          original_name: file.originalname,
          file_key: attObjectName,
          file_url: attObjectName,
          mime_type: file.mimetype,
          file_size: file.size,
        });

        createdAttachments.push(newAttachment);
      }

      await Promise.all(
        files.map((f) => fs.unlink(f.path).catch(console.error)),
      );

      return createdAttachments;
    } catch (error) {
      if (files) {
        await Promise.all(
          files.map((f) => fs.unlink(f.path).catch(console.error)),
        );
      }
      throw error;
    }
  }

  async removeAttachment(attachmentId, currentUser) {
    const attachment = await FileAttachment.findByPk(attachmentId, {
      include: [{ model: FileMaster, as: "masterFile" }],
    });

    if (!attachment) throw new AppError("Attachment not found", 404);

    // Permission Check
    if (attachment.masterFile.current_holder_id !== currentUser.id) {
      throw new AppError(
        "You can only remove attachments from files you hold.",
        403,
      );
    }

    await attachment.destroy();

    return { message: "Attachment removed successfully" };
  }

  // ... existing imports
  async getInbox(user, { limit = 10, cursor = null } = {}) {
    try {
      const limitNum = parseInt(limit) || 10;
      const decodedCursor = cursor ? decodeCursor(cursor) : null;

      // Base Condition
      const whereClause = {
        current_designation_id: user.designation_id,
        current_department_id: user.department_id,
        [Op.and]: [
          {
            [Op.or]: [
              { status: { [Op.ne]: "CLOSED" } },
              { status: { [Op.is]: null } },
            ],
          },
        ],
      };

      // Apply Cursor (Pagination Logic)
      if (decodedCursor) {
        whereClause[Op.and].push({
          [Op.or]: [
            { updatedAt: { [Op.lt]: decodedCursor.updatedAt } }, // Older than cursor
            {
              updatedAt: decodedCursor.updatedAt,
              id: { [Op.lt]: decodedCursor.id }, // Tie-breaker: smaller ID
            },
          ],
        });
      }

      const files = await FileMaster.findAll({
        where: whereClause,
        limit: limitNum + 1,
        order: [
          ["updatedAt", "DESC"],
          ["id", "DESC"],
        ],
        include: [
          { model: User, as: "creator", attributes: ["full_name"] },
          { model: Department, as: "department", attributes: ["name"] },
          {
            model: Designation,
            as: "currentDesignation",
            attributes: ["name"],
          },
          { model: Department, as: "currentDepartment", attributes: ["name"] },
          { model: User, as: "currentHolder", attributes: ["full_name"] },
          { model: FileAttachment, as: "attachments" },

          {
            model: FileMovement,
            as: "movements",
            where: {
              action: {
                [Op.in]: ["FORWARD", "CREATED", "VERIFY"], // Consider VERIFY for latest action as well
              },
            },
            order: [["id", "DESC"]],
            include: [
              {
                model: User,
                as: "sender",
                attributes: ["full_name"],
                include: [
                  {
                    model: Designation,
                    as: "designation",
                    attributes: ["name"],
                  },
                ],
              },
            ],
            attributes: ["id", "action", "remarks", "createdAt", "sent_by"],
          },
        ],
      });

      let nextCursor = null;
      if (files.length > limitNum) {
        files.pop();
        const lastItem = files[files.length - 1];
        nextCursor = encodeCursor({
          updatedAt: lastItem.updatedAt,
          id: lastItem.id,
        });
      }

      const data = files.map((file) => {
        if (file.movements && file.movements.length > 0) {
          // Sort just in case the DB order wasn't strict
          file.movements.sort((a, b) => b.id - a.id);

          // A. The Remark comes from the absolute latest action (e.g., "Verified via PIN")
          const latestAction = file.movements[0];

          // B. The Sender comes from the latest "FORWARD" or "CREATED" action
          // (Skipping "VERIFY" so your own name doesn't appear as sender)
          const senderAction = file.movements.find(
            (m) => m.action === "FORWARD" || m.action === "CREATED",
          );

          // C. Combine them for the DTO
          file.latestMovement = {
            ...latestAction.toJSON(), // Use Remark/Date from Latest
            sender: senderAction ? senderAction.sender : latestAction.sender, // Use Sender from Forwarder
          };
        } else {
          file.latestMovement = null;
        }
        return new FileResponseDto(file);
      });

      return { data, nextCursor };
    } catch (error) {
      console.error("Error in getInbox:", error);
      throw error;
    }
  }

  async getOutbox(user, { limit = 10, cursor = null } = {}) {
    const limitNum = parseInt(limit) || 10;
    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    // 1. Identify files I have ever touched/sent
    const movements = await FileMovement.findAll({
      attributes: ["file_id"],
      where: {
        sent_by_designation_id: user.designation_id,
        sent_by_department_id: user.department_id,
      },
      raw: true,
    });

    const sentFileIds = [...new Set(movements.map((m) => m.file_id))];

    if (sentFileIds.length === 0) return { data: [], nextCursor: null };

    const whereClause = {
      id: { [Op.in]: sentFileIds },
      [Op.and]: [{ current_designation_id: { [Op.ne]: user.designation_id } }],
    };

    // Apply Cursor
    if (decodedCursor) {
      whereClause[Op.and].push({
        [Op.or]: [
          { updatedAt: { [Op.lt]: decodedCursor.updatedAt } },
          {
            updatedAt: decodedCursor.updatedAt,
            id: { [Op.lt]: decodedCursor.id },
          },
        ],
      });
    }

    // 2. Fetch Files (NO STATUS CHECK)
    const files = await FileMaster.findAll({
      where: whereClause,
      limit: limitNum + 1,
      order: [
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
      include: [
        { model: User, as: "currentHolder", attributes: ["full_name"] },
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
        {
          model: FileMovement,
          as: "movements",
          attributes: ["id", "action", "remarks", "createdAt", "sent_by"],
          include: [
            {
              model: User,
              as: "sender",
              attributes: ["full_name"],
              include: [
                { model: Designation, as: "designation", attributes: ["name"] },
              ],
            },
          ],
        },
      ],
    });

    let nextCursor = null;
    if (files.length > limitNum) {
      files.pop();
      const lastItem = files[files.length - 1];
      nextCursor = encodeCursor({
        updatedAt: lastItem.updatedAt,
        id: lastItem.id,
      });
    }

    const filesWithRemark = files.map((f) => {
      if (f.movements && f.movements.length > 0) {
        f.movements.sort((a, b) => b.id - a.id); // Sort Descending by ID
        f.latestMovement = f.movements[0];
      } else {
        f.latestMovement = null;
      }
      return new FileResponseDto(f);
    });

    return { data: filesWithRemark, nextCursor };
  }

  async getFileHistory(fileId, { limit = 20, cursor = null } = {}) {
    const limitNum = parseInt(limit) || 20;
    const cursorId = cursor ? parseInt(cursor) : 0;

    const file = await FileMaster.findByPk(fileId, {
      include: [
        { model: Department, as: "department", attributes: ["name"] },
        { model: User, as: "creator", attributes: ["full_name"] },
        { model: User, as: "currentHolder", attributes: ["full_name"] },
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
        { model: FileAttachment, as: "attachments" },
        { model: User, as: "verifier", attributes: ["full_name"] },
      ],
    });

    if (!file) {
      throw new AppError("File not found", 404);
    }

    const movementWhere = { file_id: fileId };
    if (cursorId > 0) {
      movementWhere.id = { [Op.gt]: cursorId }; // Fetch newer movements than cursor
    }

    const movements = await FileMovement.findAll({
      where: movementWhere,
      limit: limitNum + 1,
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["full_name"],
          include: [
            { model: Designation, as: "designation", attributes: ["name"] },
          ],
        },
        {
          model: User,
          as: "receiver",
          attributes: ["full_name"],
          include: [
            { model: Designation, as: "designation", attributes: ["name"] },
          ],
        },
      ],
      order: [["id", "ASC"]],
    });

    let nextCursor = null;
    if (movements.length > limitNum) {
      movements.pop();
      // For history, nextCursor is just the ID of the last item returned
      nextCursor = movements[movements.length - 1].id;
    }

    return {
      data: {
        file: new FileResponseDto(file),
        history: movements.map((move) => ({
          id: move.id,
          action: move.action,
          remarks: move.remarks,
          from: move.sender ? move.sender.full_name : "System",
          to: move.receiver ? move.receiver.full_name : "System",
          senderDesignation: move.sender?.designation?.name,
          receiverDesignation: move.receiver?.designation?.name,
          date: new Date(move.createdAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          }),
        })),
      },
      nextCursor,
    };
  }

  async searchFiles(query, user) {
    // Changed arg name to 'query' to match usage
    const { text, status, priority, type } = query;
    const whereClause = {
      // 🚨 SECURITY: Force User's Department (unless you are implementing Global Admin Search later)
      department_id: user.department_id,
    };

    if (text) {
      whereClause[Op.or] = [
        { subject: { [Op.like]: `%${text}%` } },
        { file_number: { [Op.like]: `%${text}%` } },
      ];
    }

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (type) whereClause.type = type;

    const files = await FileMaster.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "currentHolder",
          attributes: ["full_name"],
        },
        // 🚨 ADDED Includes
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
        { model: Department, as: "department", attributes: ["name"] },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return files.map((file) => new FileResponseDto(file));
  }

  async getDashboardStats(user) {
    // Changed arg to 'user' object, not just userId
    // 🚨 CORRECTED: Count based on POSITION
    const pendingCount = await FileMaster.count({
      where: {
        current_designation_id: user.designation_id,
        current_department_id: user.department_id,
      },
    });

    const createdCount = await FileMaster.count({
      where: { created_by: user.id },
    });

    return {
      pending: pendingCount,
      created: createdCount,
    };
  }

  /**
   * Helper: Check Download Permission
   * logic: Allow if User is Creator OR Current Holder OR in the same Department
   */
  _hasDownloadAccess(file, user) {
    const isCreator = file.created_by === user.id;

    // Position-based check for Holder
    const isHolder =
      file.current_designation_id === user.designation_id &&
      file.current_department_id === user.department_id;

    // Department check (Public within the department)
    const isSameDept = file.department_id === user.department_id;

    // Allow if any of these are true
    return isCreator || isHolder || isSameDept;
  }

  /**
   * 1. Download PUC (Main File)
   */
  async downloadPuc(fileId, user) {
    const file = await FileMaster.findByPk(fileId);
    if (!file) throw new AppError("File not found", 404);

    if (!this._hasDownloadAccess(file, user)) {
      throw new AppError(
        "You do not have permission to download this file.",
        403,
      );
    }

    try {
      const stream = await minioClient.getObject(BUCKET_NAME, file.puc_url);
      return {
        stream,
        filename: file.original_filename,
        mimeType: file.mime_type || "application/pdf",
      };
    } catch (err) {
      console.error("MinIO Error:", err);
      throw new AppError("Error retrieving file from storage.", 500);
    }
  }

  /**
   * 2. Download Attachment
   */
  async downloadAttachment(attachmentId, user) {
    const attachment = await FileAttachment.findByPk(attachmentId);
    if (!attachment) throw new AppError("Attachment not found", 404);

    // We need the parent file to check permissions
    const file = await FileMaster.findByPk(attachment.file_id);
    if (!file) throw new AppError("Associated File not found", 404);

    if (!this._hasDownloadAccess(file, user)) {
      throw new AppError(
        "You do not have permission to download this attachment.",
        403,
      );
    }

    try {
      const stream = await minioClient.getObject(
        BUCKET_NAME,
        attachment.file_key,
      );
      return {
        stream,
        filename: attachment.original_name,
        mimeType: attachment.mime_type || "application/pdf",
      };
    } catch (err) {
      console.error("MinIO Error:", err);
      throw new AppError("Error retrieving attachment from storage.", 500);
    }
  }
}

export default new FileService();
