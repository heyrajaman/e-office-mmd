import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import sequelize from "../../../config/database.js";
import { ROLES } from "../../../config/constants.js";

class User extends Model {
  // 1. Helper to check Password during Login
  async validatePassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  // 2. Helper to check PIN during File Approval
  async validatePin(pin) {
    if (!this.security_pin) return false;
    return await bcrypt.compare(pin, this.security_pin);
  }

  async validateResetOtp(otp) {
    if (!this.reset_otp || !this.reset_otp_expires) return false;

    // Check if OTP has expired (current time > expiry time)
    if (new Date() > this.reset_otp_expires) return false;

    // Verify the Hash
    return await bcrypt.compare(otp, this.reset_otp);
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // --- CREDENTIALS ---

    // Primary Login ID (Indian Mobile)
    phone_number: {
      type: DataTypes.STRING,
      allowNull: false,
      // unique: true,
      validate: {
        // Regex: Starts with 6,7,8,or 9, followed by 9 digits
        is: /^[6-9]\d{9}$/,
      },
    },

    // Optional Profile Field
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: { isEmail: true },
    },

    // Hashed Password
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // --- PROFILE ---

    full_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // --- PERMISSIONS ---

    // Controls API Access (ADMIN, STAFF, BOARD_MEMBER)
    system_role: {
      type: DataTypes.ENUM(...Object.values(ROLES)),
      allowNull: false,
      defaultValue: ROLES.STAFF,
    },

    designation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "designations",
        key: "id",
      },
    },

    department_id: {
      type: DataTypes.INTEGER,
      allowNull: false, // Every staff member must belong to a department
      references: {
        model: "departments",
        key: "id",
      },
    },

    // --- SECURITY ---

    // Hashed PIN for "Digital Signature" approvals
    security_pin: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    signature_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    reset_otp: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Hashed OTP for password reset",
    },
    reset_otp_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Expiration time for the OTP",
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    // --- THE FIX: EXPLICITLY NAMED INDEXES ---
    // This enforces uniqueness WITHOUT causing the "Too many keys" crash.
    indexes: [
      {
        unique: true,
        fields: ["phone_number"],
        name: "users_phone_number_unique_idx", // Fixed Name = No Duplicates
      },
      {
        unique: true,
        fields: ["email"],
        name: "users_email_unique_idx", // Fixed Name = No Duplicates
      },
    ],
    // -----------------------------------------
    hooks: {
      // AUTOMATIC SECURITY: Hash password/PIN before saving to DB
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
        if (user.security_pin) {
          user.security_pin = await bcrypt.hash(user.security_pin, 10);
        }
        if (user.reset_otp) {
          user.reset_otp = await bcrypt.hash(user.reset_otp, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed("password")) {
          user.password = await bcrypt.hash(user.password, 10);
        }
        if (user.changed("security_pin")) {
          user.security_pin = await bcrypt.hash(user.security_pin, 10);
        }
        if (user.changed("reset_otp") && user.reset_otp) {
          user.reset_otp = await bcrypt.hash(user.reset_otp, 10);
        }
      },
    },
  },
);

export default User;
