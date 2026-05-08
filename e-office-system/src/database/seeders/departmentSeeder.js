import "dotenv/config";
import { sequelize, Department } from "../models/index.js";

const seedDepartments = async () => {
  try {
    console.log("🌱 Starting Department Seeder...");
    await sequelize.authenticate();

    // Ensure tables exist when running seeders standalone (fresh DB)
    await sequelize.sync({ alter: true });

    const departments = [
      { name: "Maharashtra Mandal", description: "Central Organization / HQ" },
      {
        name: "Health Services Department",
        description: "Medical and Health Initiatives",
      },
      {
        name: "Sports Department",
        description: "Sports and Physical Activities",
      },
      { name: "Youth Wing", description: "Youth Engagement and Activities" },
      {
        name: "Art & Culture Department",
        description: "Arts and Cultural Heritage",
      },
      { name: "Cultural Wing", description: "Cultural Events and Programs" },
      {
        name: "Legal Affairs Wing",
        description: "Legal Matters and Compliance",
      },
    ];

    for (const dept of departments) {
      // "findOrCreate" ensures we don't create duplicates if you run this twice
      const [, created] = await Department.findOrCreate({
        where: { name: dept.name },
        defaults: dept,
      });

      if (created) {
        console.log(`✅ Created: ${dept.name}`);
      } else {
        console.log(`⚠️  Exists: ${dept.name}`);
      }
    }

    console.log("🎉 All Departments Seeded Successfully!");
  } catch (error) {
    console.error("❌ Seeder failed:", error);
  } finally {
    await sequelize.close();
  }
};

seedDepartments();
