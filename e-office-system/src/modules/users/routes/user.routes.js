import { Router } from "express";
import UserController from "../controllers/user.controller.js";
import { protect } from "../../../middlewares/auth.middleware.js";
import { restrictTo } from "../../../middlewares/rbac.middleware.js";
import { DESIGNATIONS, ROLES } from "../../../config/constants.js";
import AppError from "../../../utils/AppError.js";
import {
  uploadSignature,
  validateSignatureUpload,
} from "../../../middlewares/upload.middleware.js";
const router = Router();

// Apply Global Protection (Must be logged in)
router.use(protect);

const permitAdminOrPresident = (req, res, next) => {
  if (req.user.system_role === ROLES.ADMIN) {
    return next();
  }

  if (req.user.designation?.name === DESIGNATIONS.PRESIDENT) {
    return next();
  }

  return next(
    new AppError("You do not have permission to perform this action", 403),
  );
};

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User management and administration
 */

// ==========================================
// 1. DEPARTMENT MANAGEMENT
// ==========================================

/**
 * @openapi
 * /users/departments:
 *   get:
 *     summary: Get list of departments for dropdown
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of departments
 *   post:
 *     summary: Create a new department (Admin only)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the department
 *                 example: IT Cell
 *               description:
 *                 type: string
 *                 description: Optional details
 *                 example: Information Technology and Support
 *     responses:
 *       "201":
 *         description: Department created successfully
 *       "400":
 *         description: Validation error
 *       "403":
 *         description: Forbidden (not an admin)
 *       "409":
 *         description: Department already exists
 */
router.get("/departments", UserController.getAllDepartments);
router.post(
  "/departments",
  restrictTo(ROLES.ADMIN),
  UserController.createDepartment,
);

// ==========================================
// 2. DESIGNATION MANAGEMENT
// ==========================================

/**
 * @openapi
 * /users/designations:
 *   get:
 *     summary: Get list of designations for dropdown
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of designations
 *   post:
 *     summary: Create a new designation (Admin only)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - level
 *             properties:
 *               name:
 *                 type: string
 *                 description: The job title (will be auto-uppercased)
 *                 example: JUNIOR CLERK
 *               level:
 *                 type: integer
 *                 enum: [10, 50, 100]
 *                 description: Hierarchy level (10 staff, 50 mid-level, 100 top-level)
 *                 example: 10
 *     responses:
 *       "201":
 *         description: Designation created successfully
 *       "400":
 *         description: Validation error (invalid level or missing name)
 *       "403":
 *         description: Forbidden (not an admin)
 *       "409":
 *         description: Designation already exists
 */
router.get("/designations", UserController.getAllDesignations);
router.post(
  "/designations",
  restrictTo(ROLES.ADMIN),
  UserController.createDesignation,
);

// ==========================================
// 3. USER MANAGEMENT
// ==========================================

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Get list of users
 *     description: Returns active users (excluding the currently logged-in user)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of users
 *   post:
 *     summary: Create a new user (Admin only)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - phoneNumber
 *               - password
 *               - systemRole
 *               - designationId
 *               - departmentId
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Ramesh Gupta
 *               phoneNumber:
 *                 type: string
 *                 description: 10-digit Indian mobile number
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Secure@123
 *               systemRole:
 *                 type: string
 *                 enum: [ADMIN, STAFF, BOARD_MEMBER]
 *                 example: STAFF
 *               designationId:
 *                 type: integer
 *                 example: 1
 *               departmentId:
 *                 type: integer
 *                 example: 1
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ramesh@example.com
 *     responses:
 *       "201":
 *         description: User created successfully
 *       "403":
 *         description: Forbidden (not an admin)
 *       "409":
 *         description: User already exists
 */
router.get("/", UserController.getAllUsers);
router.post(
  "/",
  restrictTo(ROLES.ADMIN),
  uploadSignature.single("signature"),
  validateSignatureUpload,
  UserController.createUser,
);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     summary: Update user details (Admin only)
 *     description: "Update user fields. Note: phoneNumber cannot be changed."
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               systemRole:
 *                 type: string
 *                 enum: [ADMIN, STAFF, BOARD_MEMBER]
 *               designationId:
 *                 type: integer
 *               departmentId:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: User updated successfully
 *       "400":
 *         description: Validation error (e.g., trying to change phone number)
 *       "404":
 *         description: User not found
 */
router.patch("/:id", permitAdminOrPresident, UserController.updateUser);

export default router;
