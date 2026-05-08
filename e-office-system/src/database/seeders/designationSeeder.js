import "dotenv/config";
import { sequelize, Designation } from "../models/index.js";
import { DESIGNATIONS } from "../../config/constants.js";

const seedDesignations = async () => {
  try {
    console.log("🌱 Starting Designation Seeder...");
    await sequelize.authenticate();

    // Ensure tables exist when running seeders standalone (fresh DB)
    await sequelize.sync({ alter: true });

    // 1. Define the Mapping Logic (100, 50, 10)
    const levelMapping = {
      [DESIGNATIONS.PRESIDENT]: 100,
      [DESIGNATIONS.SECRETARY]: 100,
      [DESIGNATIONS.WARDEN]: 50,
      [DESIGNATIONS.COORDINATOR]: 50,
      [DESIGNATIONS.SYSTEM_ADMIN]: 50,
      [DESIGNATIONS.CLERK]: 10,
      [DESIGNATIONS.MEMBER]: 10,
    };

    // 2. Prepare Data
    const data = Object.values(DESIGNATIONS).map((name) => ({
      name: name,
      level: levelMapping[name] || 10, // Default to 10 if missing
      is_active: true,
    }));

    // 3. Insert into Database
    for (const d of data) {
      const [, created] = await Designation.findOrCreate({
        where: { name: d.name },
        defaults: d,
      });

      if (created) {
        console.log(`✅ Created: ${d.name} (Level: ${d.level})`);
      } else {
        console.log(`⚠️  Exists: ${d.name}`);
      }
    }

    console.log("🎉 All Designations Seeded Successfully!");
  } catch (error) {
    console.error("❌ Seeder failed:", error);
  } finally {
    await sequelize.close();
  }
};

seedDesignations();
