import jwt from "jsonwebtoken";
import AppError from "../utils/AppError.js";
import { User, Designation, Department } from "../database/models/index.js";

export const protect = async (req, res, next) => {
  try {
    // 1. Get token from header
    let token;
    if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new AppError("You are not logged in. Please login to get access.", 401),
      );
    }

    // 2. Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists (Security Check)
    const currentUser = await User.findByPk(decoded.id, {
      include: [
        { model: Designation, as: "designation" },
        { model: Department, as: "department" },
      ],
    });

    if (!currentUser) {
      return next(
        new AppError("The user belonging to this token no longer exists.", 401),
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
    return next(new AppError("Invalid or expired token", 401));
  }
};
