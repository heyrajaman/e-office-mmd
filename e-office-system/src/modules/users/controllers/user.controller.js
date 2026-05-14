import UserService from "../services/user.service.js";
import CreateUserRequestDto from "../dtos/request/CreateUserRequestDto.js";
import UpdateUserRequestDto from "../dtos/request/UpdateUserRequestDto.js";
import CreateDepartmentRequestDto from "../dtos/request/CreateDepartmentRequestDto.js";
import CreateDesignationRequestDto from "../dtos/request/CreateDesignationRequestDto.js";
import AppError from "../../../utils/AppError.js";
import { minioClient, BUCKET_NAME } from "../../../config/minio.js";
import fs from "node:fs";

// Helper: Safely cleanup uploaded files on error or validation failure
const cleanupUploadedFile = async (file) => {
  if (!file) return;

  // Cleanup object uploaded by multer-s3 (if applicable)
  if (file.key) {
    try {
      await minioClient.removeObject(BUCKET_NAME, file.key);
    } catch {
      // Best-effort cleanup
    }
  }

  // Cleanup temp disk file (disk storage)
  if (file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Best-effort cleanup
    }
  }
};

class UserController {
  async createUser(req, res, next) {
    try {
      // 1. Validate Input
      const userData = CreateUserRequestDto.validate(req.body);

      const signatureFile = req.file;
      if (signatureFile) {
        const sizeKB = signatureFile.size / 1024;
        if (sizeKB < 2 || sizeKB > 100) {
          await cleanupUploadedFile(signatureFile);
          throw new AppError(
            "Signature image must be between 2KB and 100KB.",
            400,
          );
        }
      }

      // 2. Call Service
      const createdUser = await UserService.createUser(userData, signatureFile);

      // 3. Send Response
      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: createdUser,
      });
    } catch (error) {
      await cleanupUploadedFile(req.file);
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const { id } = req.params;

      // 1. Validate Input (Forbids phone number)
      const updateData = UpdateUserRequestDto.validate(req.body);

      // 2. Call Service
      const updatedUser = await UserService.updateUser(
        req.user,
        id,
        updateData,
      );

      // 3. Send Response
      res.status(200).json({
        success: true,
        message: "User details updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req, res, next) {
    try {
      // Pass the current user's ID so we can exclude them from the list
      const result = await UserService.getAllUsers(
        req.user.id,
        req.query.search,
        req.query.page,
        req.query.limit,
      );

      res.status(200).json({
        success: true,
        count: result.data.length,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllDepartments(req, res, next) {
    try {
      const departments = await UserService.getAllDepartments();

      res.status(200).json({
        success: true,
        message: "Departments fetched successfully",
        data: departments,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllDesignations(req, res, next) {
    try {
      const designations = await UserService.getAllDesignations(req.user);

      res.status(200).json({
        success: true,
        message: "Designations fetched successfully",
        count: designations.length,
        data: designations,
      });
    } catch (error) {
      next(error);
    }
  }

  async createDepartment(req, res, next) {
    try {
      const data = CreateDepartmentRequestDto.validate(req.body);
      const department = await UserService.createDepartment(data);

      res.status(201).json({
        success: true,
        message: "Department created successfully",
        data: department,
      });
    } catch (error) {
      next(error);
    }
  }

  async createDesignation(req, res, next) {
    try {
      const data = CreateDesignationRequestDto.validate(req.body);
      const designation = await UserService.createDesignation(data);

      res.status(201).json({
        success: true,
        message: "Designation created successfully",
        data: designation,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();
