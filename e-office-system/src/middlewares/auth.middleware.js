import jwt from "jsonwebtoken";
import AppError from "../utils/AppError.js";
import { User, Designation, Department } from "../database/models/index.js";
import redisClient from "../config/redis.js";

// Helper 1: Cleanly extract the token using Optional Chaining (?.)
const extractToken = (req) => {
  if (req.cookies?.jwt) {
    return req.cookies.jwt;
  }
  if (req.headers.authorization?.startsWith("Bearer")) {
    return req.headers.authorization.split(" ");
  }
  return null;
};

// Helper 2: Handle the Redis Cache & Database fetching logic
const getUser = async (userId) => {
  const cacheKey = `user:${userId}`;
  const cachedUser = await redisClient.get(cacheKey);

  if (cachedUser) {
    const parsed = JSON.parse(cachedUser);
    const user = User.build(parsed, { isNewRecord: false });

    if (parsed?.designation) {
      user.designation = Designation.build(parsed.designation, {
        isNewRecord: false,
      });
    }
    if (parsed?.department) {
      user.department = Department.build(parsed.department, {
        isNewRecord: false,
      });
    }
    return user;
  }

  // Fallback to MySQL if not in cache
  const dbUser = await User.findByPk(userId, {
    include: [
      { model: Designation, as: "designation" },
      { model: Department, as: "department" },
    ],
  });

  if (dbUser) {
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(dbUser));
  }

  return dbUser;
};

// Helper 3: Check if password was changed after token issuance
const isPasswordChangedAfterToken = (passwordChangedAt, tokenIat) => {
  if (!passwordChangedAt) return false;
  const changedTimestamp = Math.floor(
    new Date(passwordChangedAt).getTime() / 1000,
  );
  return tokenIat < changedTimestamp;
};

// Main Middleware (Cognitive Complexity drastically reduced!)
export const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next(
        new AppError("You are not logged in. Please login to get access.", 401),
      );
    }

    // 1. Redis Blacklist Check
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(
        new AppError("Your session has ended. Please log in again.", 401),
      );
    }

    // 2. Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Get User (Handles both Redis and DB)
    const currentUser = await getUser(decoded.id);

    if (!currentUser) {
      return next(
        new AppError("The user belonging to this token no longer exists.", 401),
      );
    }

    if (
      isPasswordChangedAfterToken(currentUser.passwordChangedAt, decoded.iat)
    ) {
      return next(
        new AppError(
          "User recently changed password! Please log in again.",
          401,
        ),
      );
    }

    // 4. Check if user is active
    if (!currentUser.is_active) {
      return next(new AppError("Your account has been deactivated.", 403));
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  } catch (error) {
    // Correct Exception Handling: Differentiate between JWT errors and System errors
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return next(new AppError("Invalid or expired token", 401));
    }
    // Pass real system/db errors to the global error handler
    return next(error);
  }
};
