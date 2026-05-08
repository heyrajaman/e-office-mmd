import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { sequelize, User, Designation, Department } from "../models/index.js"; // Import Department
import { ROLES, DESIGNATIONS } from "../../config/constants.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";

const seedAdmin = async () => {
  try {
    console.log("🌱 Starting Admin Seeder...");
    await sequelize.authenticate();

    // Ensure tables exist when running seeders standalone (fresh DB)
    await sequelize.sync({ alter: true });

    // 1. Check if Admin exists
    const existingAdmin = await User.findOne({
      where: { system_role: ROLES.ADMIN },
    });

    if (existingAdmin) {
      console.log("⚠️  Admin already exists. Skipping...");
      process.exit(0);
    }

    // 2. GET DESIGNATION ID (⚠️ NEW STEP)
    // We must find the ID for "SYSTEM_ADMIN" (or whatever you called it in the Designation Seeder)
    const adminDesignation = await Designation.findOne({
      where: { name: DESIGNATIONS.SYSTEM_ADMIN },
    });

    if (!adminDesignation) {
      console.error(
        "❌ Error: 'SYSTEM_ADMIN' designation not found in DB. Run designationSeeder first!",
      );
      process.exit(1);
    }

    const adminDepartment = await Department.findOne({
      where: { name: "Maharashtra Mandal" },
    });

    if (!adminDepartment) {
      console.error(
        "❌ Error: 'Maharashtra Mandal' department not found in DB. Run departmentSeeder first!",
      );
      process.exit(1);
    }

    const signaturePath = path.join(
      process.cwd(),
      "src",
      "database",
      "seeders",
      "assets",
      "admin-signature.jpeg",
    );
    let signatureUrl = null;

    if (fs.existsSync(signaturePath)) {
      console.log("📄 Found admin signature. Uploading to MinIO...");
      const ext = path.extname(signaturePath);
      const uniqueSuffix = `admin-${Date.now()}`;
      const objectName = `signatures/users/${uniqueSuffix}${ext}`;

      try {
        const fileStream = fs.createReadStream(signaturePath);
        const stats = fs.statSync(signaturePath);

        // Upload to MinIO bucket
        await minioClient.putObject(
          BUCKET_NAME,
          objectName,
          fileStream,
          stats.size,
        );
        signatureUrl = objectName; // Save this URL for the database
        console.log("✅ Admin signature successfully uploaded to MinIO!");
      } catch (uploadError) {
        console.error(
          "❌ Failed to upload signature to MinIO. Check MinIO connection:",
          uploadError,
        );
        process.exit(1);
      }
    } else {
      console.log(
        "⚠️ No signature found at src/database/seeders/assets/admin-signature.jpeg. Admin will be created without a signature.",
      );
    }

    // 3. Create Admin
    const adminFullName = process.env.ADMIN_FULL_NAME;
    const adminPhone = process.env.ADMIN_PHONE;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL || null;

    const adminData = {
      full_name: adminFullName,
      phone_number: adminPhone,
      email: adminEmail,
      password: adminPassword,
      system_role: ROLES.ADMIN,

      // ⚠️ CHANGED: Use the ID we found, not the string
      designation_id: adminDesignation.id,

      department_id: adminDepartment.id,
      signature_url: signatureUrl,
      is_active: true,
    };

    await User.create(adminData);

    console.log("✅ Super Admin created successfully!");
  } catch (error) {
    console.error("❌ Seeder failed:", error);
  } finally {
    await sequelize.close();
  }
};

seedAdmin();
