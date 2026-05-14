import AuthService from "../services/auth.service.js";
import LoginRequestDto from "../dtos/request/LoginRequestDto.js";
import ChangePasswordRequestDto from "../dtos/request/ChangePasswordRequestDto.js";
import SetPinRequestDto from "../dtos/request/SetPinRequestDto.js";
import ForgotPasswordRequestDto from "../dtos/request/ForgotPasswordRequestDto.js";
import ResetPasswordRequestDto from "../dtos/request/ResetPasswordRequestDto.js";
import UserResponseDto from "../../users/dtos/response/UserResponseDto.js";

class AuthController {
  async login(req, res, next) {
    try {
      const loginData = LoginRequestDto.validate(req.body);
      const authResponse = await AuthService.login(loginData);

      const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 Days
        httpOnly: true, // Cannot be accessed via client-side scripts (XSS protection)
        secure: process.env.NODE_ENV === "production", // Must be true in production (HTTPS only)
        sameSite: "strict", // CSRF protection
      };

      res.cookie("jwt", authResponse.token, cookieOptions);

      const { token, ...userData } = authResponse;

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: userData,
        token: token,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      // 1. Extract the token from cookies or headers using Optional Chaining
      let token;
      if (req.cookies?.jwt) {
        token = req.cookies.jwt;
      } else if (req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ");
      }

      await AuthService.logout(token);

      res.cookie("jwt", "loggedout", {
        expires: new Date(Date.now() + 10 * 1000), // Expire in 10 seconds
        httpOnly: true,
      });

      res
        .status(200)
        .json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      // req.user.id comes from 'protect' middleware
      const data = ChangePasswordRequestDto.validate(req.body);
      const result = await AuthService.changePassword(req.user.id, data);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async setPin(req, res, next) {
    try {
      const data = SetPinRequestDto.validate(req.body);
      const result = await AuthService.setPin(req.user.id, data);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      // 1. Get the validated object from DTO
      const forgotData = ForgotPasswordRequestDto.validate(req.body);

      // 2. Pass the whole object to the service
      const result = await AuthService.forgotPassword(forgotData);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // ✅ UPDATED: Reset Password using DTO
  async resetPassword(req, res, next) {
    try {
      // DTO handles validation and structuring data
      const resetData = ResetPasswordRequestDto.validate(req.body);

      const result = await AuthService.resetPassword(resetData);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      // req.user is already attached by the 'protect' middleware
      const userData = UserResponseDto(req.user);

      res.status(200).json({
        success: true,
        message: "Current user fetched successfully",
        data: userData,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
