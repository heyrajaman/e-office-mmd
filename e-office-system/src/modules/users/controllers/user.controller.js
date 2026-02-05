import UserService from "../services/user.service.js";
import CreateUserRequestDto from "../dtos/request/CreateUserRequestDto.js";
import { User } from "../../../database/models/index.js";

class UserController {
  async createUser(req, res, next) {
    try {
      // 1. Validate Input
      const userData = CreateUserRequestDto.validate(req.body);

      // 2. Call Service
      const createdUser = await UserService.createUser(userData);

      // 3. Send Response
      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: createdUser,
      });
    } catch (error) {
      next(error);
    }
  }
  async getAllUsers(req, res, next) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'full_name', 'designation'] // Only fetch what is needed
    });
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}
}

export default new UserController();
