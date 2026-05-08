import { Router } from "express";
import FileController from "../controllers/file.controller.js";
import { protect } from "../../../middlewares/auth.middleware.js";

const router = Router();

export const basePath = "/files";

// Apply Global Protection (Must be logged in)
router.use(protect);

/**
 * @openapi
 * tags:
 *   - name: Files
 *     description: File creation, inbox, and searching
 */

/**
 * @openapi
 * /files/drafts:
 *   get:
 *     summary: Get my Drafts (Files I created but haven't forwarded)
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Page size
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           nullable: true
 *         description: Base64 cursor returned from previous response (nextCursor)
 *     responses:
 *       "200":
 *         description: List of files currently in the user's drafts
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
 *                   example: Drafts fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   description: Cursor for the next page (pass as cursor query param)
 *       "401":
 *         description: Unauthorized
 */
router.get("/drafts", FileController.getDrafts);

/**
 * @openapi
 * /files/inbox:
 *   get:
 *     summary: Get my Inbox (Pending Files)
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Page size
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Base64 cursor returned from previous response (nextCursor)
 *     responses:
 *       "200":
 *         description: List of files currently held by the user's position (designation + department)
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
 *                   example: Inbox fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   description: Cursor for the next page (pass as cursor query param)
 *       "401":
 *         description: Unauthorized
 */

router.get("/inbox", FileController.getInbox);

/**
 * @openapi
 * /files/outbox:
 *   get:
 *     summary: Get my Outbox (Files I created)
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Page size
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Base64 cursor returned from previous response (nextCursor)
 *     responses:
 *       "200":
 *         description: List of files the user has sent/moved away
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
 *                   example: Outbox fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   description: Cursor for the next page (pass as cursor query param)
 *       "401":
 *         description: Unauthorized
 */
router.get("/outbox", FileController.getOutbox);

/**
 * @openapi
 * /files/search:
 *   get:
 *     summary: Search for files
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: text
 *         schema:
 *           type: string
 *         description: Search by Subject or File Number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum:
 *             - DRAFT
 *         description: "Filter by file status (currently supported: DRAFT)"
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum:
 *             - LOW
 *             - MEDIUM
 *             - HIGH
 *     responses:
 *       "200":
 *         description: Search results (department-scoped)
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
 *                   example: Files searched successfully
 *                 count:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       "401":
 *         description: Unauthorized
 */
router.get("/search", FileController.searchFiles);

/**
 * @openapi
 * /files/{id}/history:
 *   get:
 *     summary: Get movement history of a specific file
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: File ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 20
 *         description: Page size (movement items)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: integer
 *           nullable: true
 *         description: Movement ID cursor returned from previous response (nextCursor)
 *     responses:
 *       "200":
 *         description: Audit trail of the file
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
 *                   example: File history fetched successfully
 *                 data:
 *                   type: object
 *                 nextCursor:
 *                   type: integer
 *                   nullable: true
 *                   description: Cursor for the next page (pass as cursor query param)
 *       "401":
 *         description: Unauthorized
 *       "404":
 *         description: File not found
 */
router.get("/:id/history", FileController.getFileHistory);

/**
 * @openapi
 * /files:
 *   post:
 *     summary: Create a new E-File (Draft)
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *             properties:
 *               subject:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 255
 *                 description: The main subject of the file
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *                 default: LOW
 *     responses:
 *       "201":
 *         description: File created successfully
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
 *                   example: e-File created successfully
 *                 data:
 *                   type: object
 *       "400":
 *         description: Validation error
 *       "401":
 *         description: Unauthorized
 *       "500":
 *         description: Internal Server Error
 */

router.post("/", FileController.createFile);

/**
 * @openapi
 * /files/attachment/{attachmentId}/download:
 *   get:
 *     summary: Download a specific attachment
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Attachment ID
 *     responses:
 *       "200":
 *         description: Attachment file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       "403":
 *         description: Forbidden
 *       "401":
 *         description: Unauthorized
 *       "404":
 *         description: Attachment not found
 *       "500":
 *         description: Internal Server Error
 */
router.get(
  "/attachment/:attachmentId/download",
  FileController.downloadAttachment,
);

export default router;
