import { Op } from "sequelize";
import {
  sequelize,
  FileMaster,
  FileMovement,
  FileAttachment,
  User,
  Department,
  Designation,
} from "../../../database/models/index.js";
import { FILE_STATUS } from "../../../config/constants.js";
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";
import AppError from "../../../utils/AppError.js";
import FileResponseDto from "../dtos/response/FileResponseDto.js";

const encodeCursor = (data) => {
  return Buffer.from(JSON.stringify(data)).toString("base64");
};

const decodeCursor = (cursor) => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch (error) {
    console.warn("Invalid cursor format provided:", error.message);
    return null;
  }
};

class FileService {
  _applyCursorToWhereClause(whereClause, decodedCursor) {
    if (!decodedCursor) return;
    const cursorCondition = {
      [Op.or]: [
        { updatedAt: { [Op.lt]: decodedCursor.updatedAt } },
        {
          updatedAt: decodedCursor.updatedAt,
          id: { [Op.lt]: decodedCursor.id },
        },
      ],
    };

    if (whereClause[Op.and]) {
      whereClause[Op.and].push(cursorCondition);
    } else {
      whereClause[Op.and] = [cursorCondition];
    }
  }

  _extractNextCursor(files, limitNum) {
    if (files.length > limitNum) {
      files.pop();
      const lastItem = files.at(-1);
      return encodeCursor({
        updatedAt: lastItem.updatedAt,
        id: lastItem.id,
      });
    }
    return null;
  }

  async createFile(fileData, user) {
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

      const newFile = await FileMaster.create(
        {
          file_number: fileNumber,
          subject: fileData.subject,
          priority: fileData.priority,
          status: FILE_STATUS.DRAFT,
          created_by: user.id,
          department_id: user.department_id,
          current_holder_id: user.id,
          current_designation_id: user.designation_id,
          current_department_id: user.department_id,
          is_verified: false,
          verified_by: null,
          verified_at: null,
        },
        { transaction },
      );

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

      await newFile.reload({
        include: [
          { model: Department, as: "department" },
          { model: User, as: "creator" },
          { model: Designation, as: "currentDesignation" },
          { model: Department, as: "currentDepartment" },
          { model: User, as: "currentHolder" },
        ],
      });

      return FileResponseDto(newFile);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getDrafts(user, { limit = 10, cursor = null } = {}) {
    const limitNum = Number.parseInt(limit, 10) || 10;
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const whereClause = {
      current_holder_id: user.id,
      status: FILE_STATUS.DRAFT,
    };

    this._applyCursorToWhereClause(whereClause, decodedCursor);

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
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
      ],
    });

    const nextCursor = this._extractNextCursor(files, limitNum);
    const data = files.map((file) => FileResponseDto(file));

    return { data, nextCursor };
  }

  async getInbox(user, { limit = 10, cursor = null } = {}) {
    const limitNum = Number.parseInt(limit, 10) || 10;
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const whereClause = {
      current_designation_id: user.designation_id,
      current_department_id: user.department_id,
      [Op.and]: [
        {
          [Op.or]: [
            { status: { [Op.ne]: "DRAFT" } },
            { status: { [Op.is]: null } },
          ],
        },
      ],
    };

    this._applyCursorToWhereClause(whereClause, decodedCursor);

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
        {
          model: FileMovement,
          as: "movements",
          order: [["id", "DESC"]],
          include: [
            {
              model: User,
              as: "sender",
              attributes: ["full_name", "signature_url"],
              include: [
                {
                  model: Designation,
                  as: "designation",
                  attributes: ["name"],
                },
              ],
            },
            {
              model: FileAttachment,
              as: "attachments",
              attributes: [
                "id",
                "original_name",
                "file_url",
                "mime_type",
                "file_size",
              ],
            },
          ],
        },
      ],
    });

    const nextCursor = this._extractNextCursor(files, limitNum);
    const data = files.map((file) => FileResponseDto(file));

    return { data, nextCursor };
  }

  async getOutbox(user, { limit = 10, cursor = null } = {}) {
    const limitNum = Number.parseInt(limit, 10) || 10;
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

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

    this._applyCursorToWhereClause(whereClause, decodedCursor);

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
          include: [
            {
              model: User,
              as: "sender",
              attributes: ["full_name", "signature_url"],
              include: [
                { model: Designation, as: "designation", attributes: ["name"] },
              ],
            },
            {
              model: FileAttachment,
              as: "attachments",
              attributes: [
                "id",
                "original_name",
                "file_url",
                "mime_type",
                "file_size",
              ],
            },
          ],
        },
      ],
    });

    const nextCursor = this._extractNextCursor(files, limitNum);
    const filesWithRemark = files.map((f) => FileResponseDto(f));

    return { data: filesWithRemark, nextCursor };
  }

  async getFileHistory(fileId, { limit = 20, cursor = null } = {}) {
    const limitNum = Number.parseInt(limit, 10) || 20;
    const cursorId = cursor ? Number.parseInt(cursor, 10) : 0;

    const file = await FileMaster.findByPk(fileId, {
      include: [
        { model: Department, as: "department", attributes: ["name"] },
        { model: User, as: "creator", attributes: ["full_name"] },
        { model: User, as: "currentHolder", attributes: ["full_name"] },
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
        { model: User, as: "verifier", attributes: ["full_name"] },
      ],
    });

    if (!file) throw new AppError("File not found", 404);

    const movementWhere = { file_id: fileId };
    if (cursorId > 0) {
      movementWhere.id = { [Op.lt]: cursorId };
    }

    const movements = await FileMovement.findAll({
      where: movementWhere,
      limit: limitNum + 1,
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["full_name", "signature_url"],
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
        {
          model: FileAttachment,
          as: "attachments",
          attributes: [
            "id",
            "original_name",
            "file_url",
            "mime_type",
            "file_size",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });

    let nextCursor = null;
    if (movements.length > limitNum) {
      movements.pop();
      nextCursor = movements.at(-1).id;
    }

    file.movements = movements.toReversed();
    const formattedData = FileResponseDto(file);

    return {
      data: {
        fileInfo: {
          id: formattedData.id,
          subject: formattedData.subject,
          fileNumber: formattedData.fileNumber,
          priority: formattedData.priority,
          status: formattedData.status,
          currentHolder: formattedData.currentHolder,
          currentPosition: formattedData.currentPosition,
        },
        history: formattedData.thread,
      },
      nextCursor,
    };
  }

  async searchFiles(query, user) {
    const { text, status, priority, startDate, endDate } = query;
    const whereClause = {
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

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          new Date(startDate),
          new Date(`${endDate}T23:59:59.999Z`),
        ],
      };
    } else if (startDate) {
      whereClause.createdAt = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      whereClause.createdAt = {
        [Op.lte]: new Date(`${endDate}T23:59:59.999Z`),
      };
    }

    const files = await FileMaster.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "currentHolder",
          attributes: ["full_name"],
        },
        { model: Designation, as: "currentDesignation", attributes: ["name"] },
        { model: Department, as: "currentDepartment", attributes: ["name"] },
        { model: Department, as: "department", attributes: ["name"] },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return files.map((file) => FileResponseDto(file));
  }

  _hasDownloadAccess(file, user) {
    const isCreator = file.created_by === user.id;

    const isHolder =
      file.current_designation_id === user.designation_id &&
      file.current_department_id === user.department_id;

    const isSameDept = file.department_id === user.department_id;

    return isCreator || isHolder || isSameDept;
  }

  async downloadAttachment(attachmentId, user) {
    const attachment = await FileAttachment.findByPk(attachmentId);
    if (!attachment) throw new AppError("Attachment not found", 404);

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

  async getFileOrThrow(fileId, transaction = null) {
    const file = await FileMaster.findByPk(fileId, { transaction });
    if (!file) throw new AppError("File not found", 404);
    return file;
  }

  async markFileVerified(fileId, verifiedByUserId, transaction = null) {
    const file = await this.getFileOrThrow(fileId, transaction);

    file.is_verified = true;
    file.verified_by = verifiedByUserId;
    file.verified_at = new Date();

    await file.save({ transaction });
    return file;
  }

  async updateFileLocation(fileId, newHolderId, transaction = null) {
    const file = await this.getFileOrThrow(fileId, transaction);

    const receiver = await User.findByPk(newHolderId, { transaction });
    if (!receiver) throw new AppError("Receiver not found", 404);

    file.current_holder_id = newHolderId;
    file.current_designation_id = receiver.designation_id;
    file.current_department_id = receiver.department_id;

    file.status = null;

    await file.save({ transaction });
    return file;
  }
}

export default new FileService();
