import nodemailer from "nodemailer";
import axios from "axios";

class NotificationService {
  constructor() {
    // 1. Setup Email Transporter (Gmail or SMTP)
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT), // Ensure this is a Number
      secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send an Email
   */
  async sendEmail(to, subject, html) {
    try {
      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log("📧 Email sent: %s", info.messageId);
      return true;
    } catch (error) {
      console.error("❌ Email Error:", error);
      return false;
    }
  }

  /**
   * Send an SMS via Private Vendor (Updated for your specific Vendor API)
   */
  async sendSMS(phone, message, otp) {
    try {
      // Basic validation
      const phoneStr = String(phone);
      if (phoneStr?.length !== 10) {
        throw new Error("Invalid phone number for SMS");
      }

      // CONFIGURATION: Mapped exactly to your Vendor's PHP/Java Doc
      const params = {
        username: process.env.SMS_USERNAME,
        apikey: process.env.SMS_API_KEY,
        apirequest: "Text", // Vendor
        sender: process.env.DLT_SENDER_ID, // Your 6-char ID
        route: "TRANS", // Transactional Route
        mobile: phoneStr, // Vendor calls it 'mobile'
        message: message, // Content
        TemplateID: process.env.DLT_TE_ID, // DLT Template ID
        format: "JSON", // Request JSON response
      };

      // API CALL: GET Request (Query Params)
      const response = await axios.get(process.env.SMS_API_URL, { params });

      console.log("📱 SMS Response:", response.data);

      // ✅ FIXED: Replaced if-then-else with a single return statement
      return response.status === 200;
    } catch (error) {
      console.error("❌ SMS Error:", error.response?.data || error.message);
      // We return false so the flow continues even if SMS fails
      return false;
    }
  }
}

export default new NotificationService();
