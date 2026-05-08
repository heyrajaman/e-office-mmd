import { Router } from "express";
import WorkflowController from "../controllers/workflow.controller.js";
import { protect } from "../../../middlewares/auth.middleware.js";
import {
  upload,
  validatePdfUploads,
} from "../../../middlewares/upload.middleware.js";

const router = Router();

router.use(protect);

/**
 * @openapi
 * tags:
 *   - name: Workflow
 *     description: Managing file movements (Forward, Revert, Approve)
 */

/**
 * @openapi
 * /workflow/files/{id}/move:
 *   post:
 *     summary: Move a file to another user or verify it
 *     description: |
 *       Handle file movements through the workflow. Supports two main actions:
 *
 *       **FORWARD**: Move file to another user with hierarchy validation
 *       - Staff cannot send directly to President (must go through Board Members)
 *       - Files must be verified before sending to President
 *       - Creates audit trail for tracking
 *
 *       **VERIFY**: Mark file as verified (Only Board Members and President)
 *       - Requires valid 4-digit security PIN
 *       - Resets verification flag when file is moved after verification
 *
 *       **Business Rules Enforced:**
 *       1. Staff cannot bypass hierarchy to send to President
 *       2. Files must be verified before forwarding to President
 *       3. President must verify files before forwarding them
 *       4. Cannot send file to yourself
 *       5. Sender must be current holder of the file
 *     tags:
 *       - Workflow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The unique ID of the file to move
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - remarks
 *             properties:
 *               receiverId:
 *                 type: integer
 *                 description: Target User ID. Required for FORWARD action, optional for VERIFY
 *                 example: 2
 *               action:
 *                 type: string
 *                 description: The movement action to perform
 *                 enum: [FORWARD, VERIFY]
 *                 default: FORWARD
 *                 example: "FORWARD"
 *               remarks:
 *                 type: string
 *                 description: Mandatory comments (minimum 3 characters) for the audit trail. Required for both actions
 *                 minLength: 3
 *                 example: "Forwarding to President for final approval"
 *               pin:
 *                 type: string
 *                 description: 4-digit security PIN. Required only for VERIFY action (sensitive operation)
 *                 pattern: '^\d{4}$'
 *                 example: "1234"
 *           examples:
 *             forwardFile:
 *               summary: Forward file to another user
 *               value:
 *                 action: "FORWARD"
 *                 receiverId: 2
 *                 remarks: "Forwarding to Board Member for review"
 *             verifyFile:
 *               summary: Verify a file (Board Member/President only)
 *               value:
 *                 action: "VERIFY"
 *                 remarks: "File verified after thorough review"
 *                 pin: "1234"
 *     responses:
 *       '200':
 *         description: File moved/verified successfully
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
 *                   example: "File moved successfully"
 *                 data:
 *                   type: object
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "File moved successfully"
 *                         newHolderId:
 *                           type: integer
 *                           example: 2
 *                       description: Response for FORWARD action
 *                     - type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "File verified successfully."
 *                       description: Response for VERIFY action
 *       '400':
 *         description: |
 *           Validation or Business Rule Error. Possible scenarios:
 *           - Missing required fields (receiverId for FORWARD, remarks, action)
 *           - Remarks too short (< 3 characters)
 *           - PIN invalid format or incorrect (for VERIFY)
 *           - Verification required before sending to President
 *           - Cannot send file to yourself
 *           - Receiver not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Verification Required: You must VERIFY this file before forwarding to the President."
 *       '403':
 *         description: |
 *           Forbidden - Authorization/Permission Denied. Possible scenarios:
 *           - User is not current file holder
 *           - Hierarchy violation: Staff trying to send to President
 *           - Only Board Members/President can verify files
 *           - Role/designation mismatch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Hierarchy Violation: Staff cannot send files directly to the President."
 *       '404':
 *         description: |
 *           Resource Not Found
 *           - File with given ID not found
 *           - Receiver user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "File not found"
 *       '500':
 *         description: Internal Server Error
 */

// POST /api/v1/workflow/files/:id/move
router.post(
  "/files/:id/move",
  upload.array("attachments", 10),
  validatePdfUploads,
  WorkflowController.moveFile,
);

export default router;
