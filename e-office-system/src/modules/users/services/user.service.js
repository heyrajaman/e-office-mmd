import {
  sequelize,
  User,
  Department,
  Designation,
} from "../../../database/models/index.js";
import { Op } from "sequelize";
import UserResponseDto from "../dtos/response/UserResponseDto.js";
import AppError from "../../../utils/AppError.js";
import { DESIGNATIONS, ROLES } from "../../../config/constants.js";
import redisClient from "../../../config/redis.js";
import storageService from "../../storage/storage.service.js";

class UserService {
  async createUser(data, signatureFile) {
    if (data.systemRole === ROLES.ADMIN) {
      const adminExists = await User.findOne({
        where: { system_role: ROLES.ADMIN, is_active: true },
      });
      if (adminExists) {
        throw new AppError(
          "System already has an Administrator. Only one Admin is allowed.",
          403,
        );
      }
    }

    // 1. Check for Duplicate Phone Number
    const existingUser = await User.findOne({
      where: { phone_number: data.phoneNumber },
    });
    if (existingUser) {
      throw new AppError("User with this phone number already exists", 409);
    }

    // 2. Check if Department Exists
    const department = await Department.findByPk(data.departmentId);
    if (!department) {
      throw new AppError("Department not found", 404);
    }

    const designation = await Designation.findByPk(data.designationId);
    if (!designation) {
      throw new AppError("Designation not found", 404);
    }

    let signatureUrl = null;
    if (signatureFile) {
      // ✅ FIXED: Flattened 'else { if }' into 'else if'
      if (signatureFile.key) {
        signatureUrl = signatureFile.key;
      } else if (signatureFile.path) {
        signatureUrl = await storageService.uploadFileToMinIO(
          signatureFile,
          "signatures/users",
        );
      } else if (signatureFile.buffer) {
        signatureUrl = await storageService.uploadBufferToMinIO(
          signatureFile,
          "signatures/users",
        );
      } else {
        throw new AppError(
          "Signature upload failed: unsupported file payload.",
          500,
        );
      }
    }

    // 3. Create User
    const newUser = await User.create({
      full_name: data.fullName,
      phone_number: data.phoneNumber,
      password: data.password,
      system_role: data.systemRole,
      designation_id: data.designationId,
      department_id: data.departmentId,
      email: data.email,
      signature_url: signatureUrl,
      is_active: true,
    });

    await newUser.reload({ include: ["department", "designation"] });

    // ✅ FIXED: Removed 'new' since it's a factory function now
    return UserResponseDto(newUser);
  }

  // ✅ HELPER 1: Extracts complexity out of updateUser
  _checkAdminPrivilegeGrant(currentUser, data) {
    if (data.systemRole === ROLES.ADMIN) {
      // ✅ FIXED: Used optional chaining
      if (currentUser?.system_role !== ROLES.ADMIN) {
        throw new AppError(
          "CRITICAL: Unauthorized attempt to grant Admin privileges.",
          403,
        );
      }
    }
  }

  // ✅ HELPER 2: Extracts complexity out of updateUser
  async _validateAndReallocateDesignation(
    userId,
    newDesignationId,
    targetDepartmentId,
    isChanging,
    transaction,
  ) {
    const newDesignation = await Designation.findByPk(newDesignationId, {
      transaction,
    });
    if (!newDesignation) throw new AppError("Designation not found", 404);

    if (isChanging) {
      await this._handleSeatReallocation(
        userId,
        newDesignation,
        targetDepartmentId,
        transaction,
      );
    }
  }

  // ✅ HELPER 3: Extracts complexity out of updateUser
  async _downgradeEmptyDesignation(oldDesignationId, transaction) {
    const remainingUsersCount = await User.count({
      where: { designation_id: oldDesignationId },
      transaction,
    });

    if (remainingUsersCount === 0) {
      await Designation.update(
        { level: 50 },
        { where: { id: oldDesignationId }, transaction },
      );
    }
  }

  async updateUser(currentUser, userId, data) {
    const transaction = await sequelize.transaction();
    try {
      this._checkAdminPrivilegeGrant(currentUser, data);

      const user = await User.findByPk(userId);
      if (!user) throw new AppError("User not found", 404);

      await this._handleAdminRoleSwap(user, data, transaction);

      let isDesignationChanging = false;
      const oldDesignationId = user.designation_id;

      if (data.designationId) {
        isDesignationChanging = data.designationId !== user.designation_id;
        const targetDepartmentId = data.departmentId || user.department_id;
        await this._validateAndReallocateDesignation(
          userId,
          data.designationId,
          targetDepartmentId,
          isDesignationChanging,
          transaction,
        );
      }

      if (data.departmentId) {
        const department = await Department.findByPk(data.departmentId, {
          transaction,
        });
        if (!department) throw new AppError("Department not found", 404);
      }

      if (data.email && data.email !== user.email) {
        const emailExists = await User.findOne({
          where: { email: data.email, id: { [Op.ne]: userId } },
          transaction,
        });
        if (emailExists)
          throw new AppError("Email already in use by another user", 409);
      }

      // ✅ FIXED: Removed negated ternary conditions (e.g. replaced a !== undefined ? a : b with a === undefined ? b : a)
      Object.assign(user, {
        full_name: data.fullName || user.full_name,
        email: data.email === undefined ? user.email : data.email,
        system_role: data.systemRole || user.system_role,
        designation_id: data.designationId || user.designation_id,
        department_id: data.departmentId || user.department_id,
        is_active: data.isActive === undefined ? user.is_active : data.isActive,
      });

      await user.save({ transaction });

      if (isDesignationChanging) {
        await this._downgradeEmptyDesignation(oldDesignationId, transaction);
      }

      await transaction.commit();
      await redisClient.del(`user:${userId}`);
      await user.reload({ include: ["department", "designation"] });

      // ✅ FIXED: Removed 'new' since it's a factory function now
      return UserResponseDto(user);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async _handleAdminRoleSwap(user, data, transaction) {
    if (data.systemRole !== ROLES.ADMIN || user.system_role === ROLES.ADMIN) {
      return;
    }

    const currentAdmin = await User.findOne({
      where: { system_role: ROLES.ADMIN, is_active: true },
      transaction,
    });

    if (!currentAdmin) return;

    currentAdmin.system_role = ROLES.STAFF;
    await currentAdmin.save({ transaction });
  }

  async _handleSeatReallocation(
    userId,
    newDesignation,
    targetDepartmentId,
    transaction,
  ) {
    const multiUserDesignations = [DESIGNATIONS.MEMBER, DESIGNATIONS.CLERK];
    if (multiUserDesignations.includes(newDesignation.name)) return;

    const existingHolder = await User.findOne({
      where: {
        designation_id: newDesignation.id,
        department_id: targetDepartmentId,
        id: { [Op.ne]: userId },
        is_active: true,
      },
      transaction,
    });

    if (!existingHolder) return;

    const memberDesignation = await Designation.findOne({
      where: { name: DESIGNATIONS.MEMBER },
      transaction,
    });

    if (!memberDesignation) {
      throw new AppError(
        "System Error: 'MEMBER' designation not found. Cannot auto-demote.",
        500,
      );
    }

    existingHolder.designation_id = memberDesignation.id;
    await existingHolder.save({ transaction });
  }

  async getAllUsers(currentUserId, searchQuery = null, page = 1, limit = 50) {
    const pageNum = Number.isFinite(Number(page))
      ? Number.parseInt(page, 10)
      : 1;
    const limitNum = Number.isFinite(Number(limit))
      ? Number.parseInt(limit, 10)
      : 50;
    const safePage = pageNum > 0 ? pageNum : 1;
    const safeLimit = Math.min(Math.max(limitNum, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const whereClause = {
      id: { [Op.ne]: currentUserId },
      is_active: true,
    };

    const q = typeof searchQuery === "string" ? searchQuery.trim() : "";
    if (q) {
      whereClause[Op.or] = [
        { full_name: { [Op.like]: `${q}%` } },
        { "$designation.name$": { [Op.like]: `${q}%` } },
      ];
    }

    const { rows: users, count: total } = await User.findAndCountAll({
      where: whereClause,
      limit: safeLimit,
      offset,
      distinct: true,
      attributes: [
        "id",
        "full_name",
        "phone_number",
        "email",
        "system_role",
        "is_active",
      ],
      include: [
        {
          model: Designation,
          as: "designation",
          attributes: ["id", "name"],
        },
        {
          model: Department,
          as: "department",
          attributes: ["id", "name"],
        },
      ],
      order: [["full_name", "ASC"]],
      subQuery: false,
    });

    return {
      data: users,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getAllDepartments() {
    const cachedDepartments = await redisClient.get("departments:all");
    if (cachedDepartments) {
      return JSON.parse(cachedDepartments);
    }

    const departments = await Department.findAll({
      attributes: ["id", "name"],
      where: { is_active: true },
    });

    await redisClient.setEx(
      "departments:all",
      86400,
      JSON.stringify(departments),
    );

    return departments;
  }

  async getAllDesignations(currentUser) {
    let showSystemAdmin = false;

    if (
      currentUser &&
      currentUser.designation?.name === DESIGNATIONS.PRESIDENT
    ) {
      showSystemAdmin = true;
    }

    const cacheKey = showSystemAdmin
      ? "designations:president"
      : "designations:standard";

    const cachedDesignations = await redisClient.get(cacheKey);
    if (cachedDesignations) {
      return JSON.parse(cachedDesignations);
    }

    const whereClause = { is_active: true };
    if (!showSystemAdmin) {
      whereClause.name = { [Op.ne]: DESIGNATIONS.SYSTEM_ADMIN };
    }

    const designations = await Designation.findAll({
      where: whereClause,
      attributes: ["id", "name", "level"],
      order: [["level", "DESC"]],
    });

    await redisClient.setEx(cacheKey, 86400, JSON.stringify(designations));

    return designations;
  }

  async createDepartment(data) {
    const existingDept = await Department.findOne({
      where: { name: data.name },
    });
    if (existingDept) {
      throw new AppError(`Department '${data.name}' already exists`, 409);
    }

    const newDept = await Department.create({
      name: data.name,
      description: data.description,
      is_active: true,
    });

    await redisClient.del("departments:all");

    return newDept;
  }

  async createDesignation(data) {
    const normalizedName = data.name.trim().toUpperCase();

    const existingDesig = await Designation.findOne({
      where: { name: normalizedName },
    });
    if (existingDesig) {
      throw new AppError(`Designation '${normalizedName}' already exists`, 409);
    }

    const newDesig = await Designation.create({
      name: normalizedName,
      level: data.level,
      is_active: true,
    });

    await redisClient.del(["designations:president", "designations:standard"]);

    return newDesig;
  }
}

export default new UserService();
