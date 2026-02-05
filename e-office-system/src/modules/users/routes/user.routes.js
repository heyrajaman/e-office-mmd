import { Router } from "express";
import UserController from "../controllers/user.controller.js";
import { protect } from "../../../middlewares/auth.middleware.js";
import { restrictTo } from "../../../middlewares/rbac.middleware.js";
import { ROLES } from "../../../config/constants.js";

const router = Router();

router.use(protect);

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User management and administration
 */

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create a new User (Admin Only)
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
 *               - designation
 *               - departmentId
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ramesh Gupta"
 *               phoneNumber:
 *                 type: string
 *                 description: 10-digit Indian mobile number
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Secure@123"
 *               systemRole:
 *                 type: string
 *                 enum: [ADMIN, STAFF, BOARD_MEMBER]
 *                 example: "STAFF"
 *               designation:
 *                 type: string
 *                 description: The official job title
 *                 enum: [PRESIDENT, SECRETARY, WARDEN, COORDINATOR, MEMBER, CLERK, SYSTEM_ADMIN]
 *                 example: "CLERK"
 *               departmentId:
 *                 type: integer
 *                 example: 1
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "ramesh@example.com"
 *     responses:
 *       '201':
 *         description: User created successfully
 *       '403':
 *         description: Forbidden (You are not an Admin)
 *       '409':
 *         description: User already exists
 */
router.get("/", restrictTo(ROLES.ADMIN, ROLES.STAFF, ROLES.BOARD_MEMBER), UserController.getAllUsers);
router.post("/", restrictTo(ROLES.ADMIN), UserController.createUser);

export default router;
