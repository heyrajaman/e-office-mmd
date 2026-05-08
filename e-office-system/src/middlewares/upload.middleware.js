import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileTypeFromFile } from "file-type";
import AppError from "../utils/AppError.js";

const tmpUploadsDir = path.join(process.cwd(), "tmp_uploads");
fs.mkdirSync(tmpUploadsDir, { recursive: true });

const buildTempFilename = (file) => {
  const ext = path.extname(file?.originalname || "");
  const uniqueSuffix = crypto.randomBytes(16).toString("hex");
  return `${file?.fieldname}-${Date.now()}-${uniqueSuffix}${ext}`;
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpUploadsDir);
  },
  filename: (req, file, cb) => {
    try {
      cb(null, buildTempFilename(file));
    } catch (err) {
      cb(err);
    }
  },
});

// 3. Filter: Only allow PDFs for E-files
const pdfFilter = (req, file, cb) => {
  // Do not trust client-provided mimetype; validate via magic numbers after upload.
  cb(null, true);
};

// 4. Configure Multer for PDFs
export const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit: 10MB
  fileFilter: pdfFilter,
});

// 5. Filter: Only allow JPG/PNG for Signatures
const signatureFilter = (req, file, cb) => {
  // Do not trust client-provided mimetype; validate via magic numbers after upload.
  cb(null, true);
};

// 6. Configure Multer for Signatures
export const uploadSignature = multer({
  storage: diskStorage,
  limits: { fileSize: 100 * 1024 }, // Max 100KB
  fileFilter: signatureFilter,
});

const safeUnlink = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
};

// Helper 1: Eliminates the ugly nested ternary operation
const getUploadedFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.file) return [req.file];
  return [];
};

// Helper 2: Eliminates the nested loops driving up Cognitive Complexity
const validateFilesArePdfs = async (files) => {
  for (const file of files) {
    if (!file?.path) continue;
    const type = await fileTypeFromFile(file.path);
    if (type?.mime !== "application/pdf") {
      return false;
    }
  }
  return true;
};

export const validatePdfUploads = async (req, res, next) => {
  const files = getUploadedFiles(req);

  try {
    const arePdfsValid = await validateFilesArePdfs(files);

    if (!arePdfsValid) {
      files.forEach((f) => safeUnlink(f?.path));
      return next(
        new AppError(
          "Invalid file signature. Only actual PDFs are allowed.",
          400,
        ),
      );
    }

    next();
  } catch (err) {
    // On unexpected errors, cleanup temp files.
    files.forEach((f) => safeUnlink(f?.path));
    next(err);
  }
};

export const validateSignatureUpload = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file?.path) return next();

    const type = await fileTypeFromFile(file.path);
    const allowedMimes = new Set(["image/jpeg", "image/png"]);

    // Uses optional chaining to simplify the check
    if (!allowedMimes.has(type?.mime)) {
      safeUnlink(file.path);
      return next(
        new AppError(
          "Invalid file signature. Only actual PNG/JPEG images are allowed.",
          400,
        ),
      );
    }

    next();
  } catch (err) {
    safeUnlink(req.file?.path);
    next(err);
  }
};
