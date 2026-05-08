import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import redisClient from "./redis.js";

let io;

export const initSocket = async (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  try {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.io Redis Adapter connected successfully");
  } catch (error) {
    console.error("❌ Socket.io Redis Adapter error:", error);
  }

  io.use(async (socket, next) => {
    try {
      let token;

      // 1. Check if token is sent explicitly in socket auth (recommended for React)
      if (socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }
      // 2. Fallback: Check if it's in the cookies (like your Express setup)
      else if (socket.handshake.headers?.cookie) {
        const cookies = socket.handshake.headers.cookie.split(";");
        const jwtCookie = cookies.find((c) => c.trim().startsWith("jwt="));
        if (jwtCookie) {
          token = jwtCookie.split("=")[1];
        }
      }

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      // 3. Redis Blacklist Check
      const isBlacklisted = await redisClient.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return next(
          new Error("Authentication error: Session expired or logged out"),
        );
      }

      // 4. Verify Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach the decoded ID to the socket so we know who this is
      socket.userId = decoded.id;

      next();
    } catch (error) {
      console.error("Socket Auth Error:", error.message);
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  // 4. Handle connection events
  io.on("connection", (socket) => {
    // AUTOMATICALLY join the user's specific notification room
    const personalRoom = `user_${socket.userId}`;
    socket.join(personalRoom);

    console.log(
      `🔌 User ID ${socket.userId} connected and joined room: ${personalRoom}`,
    );

    socket.on("disconnect", () => {
      console.log(`🔌 User ID ${socket.userId} disconnected`);
    });
  });

  return io;
};

// 5. Utility function to access the io instance from anywhere in your project
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};
