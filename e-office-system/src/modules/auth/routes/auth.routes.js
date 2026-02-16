import { Router } from "express";
import rateLimit from "express-rate-limit";
import AuthController from "../controllers/auth.controller.js";
import { protect } from "../../../middlewares/auth.middleware.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `windowMs`
  message: {
    success: false,
    message:
      "Too many login attempts from this IP, please try again after 15 minutes",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: User authentication and security
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login to the system
 *     description: |
 *       Authenticates a user using phone number and password.
 *
 *       On success, a JWT is set in an HttpOnly cookie named `jwt`.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: 10-digit Indian mobile number
 *                 pattern: '^[6-9]\\d{9}$'
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Strong password (8-16 chars, uppercase, lowercase, number, special; no spaces)
 *                 example: "Admin@123"
 *     responses:
 *       '200':
 *         description: Login successful (sets `jwt` HttpOnly cookie)
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *             description: HttpOnly cookie containing the JWT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         fullName:
 *                           type: string
 *                           example: "Admin User"
 *                         phoneNumber:
 *                           type: string
 *                           example: "9876543210"
 *                         systemRole:
 *                           type: string
 *                           example: "ADMIN"
 *                         designation:
 *                           type: string
 *                           nullable: true
 *                           example: "SYSTEM_ADMIN"
 *                         department:
 *                           type: string
 *                           nullable: true
 *                           example: "ADMIN"
 *                         isPinSet:
 *                           type: boolean
 *                           example: true
 *       '400':
 *         description: Validation error (invalid phone number or password format)
 *       '401':
 *         description: Invalid credentials
 *       '403':
 *         description: Account disabled
 */
router.post("/login", loginLimiter, AuthController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout of the system (clears HttpOnly cookie)
 *     description: Clears the `jwt` cookie by setting a short expiry.
 *     tags:
 *       - Auth
 *     responses:
 *       '200':
 *         description: Logged out successfully
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *             description: Clears the `jwt` cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 */
router.post("/logout", AuthController.logout);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change login password
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 description: Strong password (8-16 chars, uppercase, lowercase, number, special)
 *     responses:
 *       '200':
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       '400':
 *         description: Validation error (new password rules or same as current)
 *       '401':
 *         description: Incorrect current password
 *       '404':
 *         description: User not found
 */
router.post("/change-password", protect, AuthController.changePassword);

/**
 * @openapi
 * /auth/set-pin:
 *   post:
 *     summary: Set or update 4-digit security PIN (2FA)
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - newPin
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current login password for verification
 *               newPin:
 *                 type: string
 *                 pattern: '^\\d{4}$'
 *                 description: New 4-digit PIN
 *     responses:
 *       '200':
 *         description: PIN updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Security PIN set successfully"
 *       '400':
 *         description: Validation error (PIN must be 4 digits) or PIN cannot be same as old
 *       '401':
 *         description: Invalid password provided
 *       '404':
 *         description: User not found
 */
router.post("/set-pin", protect, AuthController.setPin);

export default router;
