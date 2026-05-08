import jwt from "jsonwebtoken";
import {
  User,
  Department,
  Designation,
} from "../../../database/models/index.js";
import AuthResponseDto from "../dtos/response/AuthResponseDto.js";
import AppError from "../../../utils/AppError.js";
import crypto from "node:crypto"; // ✅ Fixed: node prefix
import notificationService from "../../notifications/services/notification.service.js";
import { passwordResetTemplate } from "../../notifications/templates/emailTemplates.js";
import redisClient from "../../../config/redis.js";

class AuthService {
  async login(loginDto) {
    // 1. Find User (Include Department info)
    const user = await User.findOne({
      where: { phone_number: loginDto.phoneNumber },
      include: [
        { model: Department, as: "department" },
        { model: Designation, as: "designation" },
      ],
    });

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    // 2. Validate Password (using the model helper we wrote earlier)
    const isValid = await user.validatePassword(loginDto.password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 401);
    }

    if (!user.is_active) {
      throw new AppError("Account is disabled. Contact Admin.", 403);
    }

    await redisClient.del(`user:${user.id}`);

    // 3. Generate JWT Token
    const token = this.generateToken(user);

    // 4. Return DTO (Sanitized)
    // ✅ Fixed: Removed 'new' since AuthResponseDto is now a function
    return AuthResponseDto(user, token);
  }

  async logout(token) {
    if (!token || token === "loggedout") return;

    const MAX_TTL = 7 * 24 * 60 * 60; // 7 days (seconds)

    let decoded;
    try {
      // Verify signature; if invalid/expired, do not write anything to Redis.
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return;
    }

    if (!decoded?.exp) return;

    let timeToLive = decoded.exp - Math.floor(Date.now() / 1000);
    timeToLive = Math.min(timeToLive, MAX_TTL);
    if (timeToLive <= 0) return;

    await redisClient.setEx(`blacklist:${token}`, timeToLive, "true");
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await User.findByPk(userId);
    if (!user) throw new AppError("User not found", 404);

    // 1. Verify Current Password
    const isMatch = await user.validatePassword(currentPassword);
    if (!isMatch) {
      throw new AppError("Current password is incorrect", 401);
    }

    // 2. Update Password (Hook will hash it automatically)
    user.password = newPassword;
    await user.save();

    await redisClient.del(`user:${userId}`);

    return { message: "Password changed successfully" };
  }

  async setPin(userId, { password, newPin }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // 1. Verify Password (2FA Step)
    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      throw new AppError("Invalid password. Cannot set PIN.", 401);
    }

    // 2. Check if New PIN is same as Old PIN
    // validatePin compares plain text against the hash
    const isSameAsOld = await user.validatePin(newPin);
    if (isSameAsOld) {
      throw new AppError(
        "New PIN cannot be the same as the previous one.",
        400,
      );
    }

    // 2. Save PIN (The Model Hook will auto-hash this!)
    user.security_pin = newPin;
    await user.save();

    await redisClient.del(`user:${userId}`);

    return { message: "Security PIN set successfully" };
  }

  async forgotPassword(data) {
    const { phoneNumber } = data;
    // 1. Find User
    const user = await User.findOne({ where: { phone_number: phoneNumber } });
    if (!user) {
      throw new AppError("User with this phone number not found", 404);
    }

    // 2. Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 3. Save OTP to Redis with a 5-minute TTL (300 seconds)
    // We prefix the key with 'reset_otp:' so it doesn't collide with other data
    await redisClient.setEx(`reset_otp:${phoneNumber}`, 300, otp);

    // 4. Send Notifications
    const smsMessage = `Dear Member, your OTP for updating your password is ${otp}. The OTP is valid for 5 minutes. MMR`;

    // We run these in parallel without awaiting to ensure fast API response,
    // or you can await them if you want to be sure they sent.
    await notificationService.sendSMS(user.phone_number, smsMessage, otp);

    if (user.email) {
      const emailHtml = passwordResetTemplate(otp);

      await notificationService.sendEmail(
        user.email,
        "Password Reset OTP - MDLRPR",
        emailHtml,
      );
    }

    return { message: "OTP sent successfully to registered phone and email." };
  }

  async resetPassword({ phoneNumber, otp, newPassword }) {
    const user = await User.findOne({ where: { phone_number: phoneNumber } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // 1. Fetch the OTP from Redis
    const storedOtp = await redisClient.get(`reset_otp:${phoneNumber}`);

    // 2. Validate OTP
    // If storedOtp is null, it means it expired and Redis auto-deleted it
    if (!storedOtp || storedOtp !== otp) {
      throw new AppError("Invalid or Expired OTP", 400);
    }

    // 2. Set New Password
    user.password = newPassword;
    await user.save();

    await redisClient.del(`reset_otp:${phoneNumber}`);
    await redisClient.del(`user:${user.id}`);

    return { message: "Password reset successfully. You can now login." };
  }

  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        role: user.system_role,
        designation: user.designation ? user.designation.name : null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
    );
  }
}

export default new AuthService();
