import "dotenv/config"; // Automatically loads .env
import http from "node:http";
import app from "./src/app.js"; // Note the .js extension is mandatory in ESM
import { sequelize } from "./src/database/models/index.js"; // Will enable later
import { initMinio } from "./src/config/minio.js";
import { initSocket } from "./src/config/socket.js";
import "./src/modules/workflow/events/workflow.socket.listener.js";

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    console.log("⏳ Starting Maharashtra Mandal e-Office System...");

    // Database connection will go here
    await sequelize.authenticate();
    console.log("✅ Database Connection Established.");

    // 2. Sync Models (Create Tables if not exist)
    // force: false means "don't delete data if table exists"
    // alter: true means "update table structure if model changes"
    await sequelize.sync({ alter: true });
    console.log("✅ Database Models Synced.");

    await initMinio();

    // 1. Create an HTTP server and wrap your Express app inside it
    const server = http.createServer(app);

    // 2. Initialize Socket.io and attach it to the HTTP server
    await initSocket(server);

    server.listen(PORT, () => {
      console.log(`
            ################################################
            🚀 Server running on http://localhost:${PORT}
            👉 Environment: ${process.env.NODE_ENV}
            ################################################
            `);
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
