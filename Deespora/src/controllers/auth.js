const bcrypt = require('bcryptjs');
const User = require("../models/User");
const { success, error } = require("../utils/response");
const { signJwt } = require("../utils/jwt");
const { randomToken, hashToken, compareToken } = require("../utils/crypto");
const { sendEmail } = require("../utils/sendEmail");
const {sendSMS,sendVerificationSMS,verifyTwilioCode} = require("../utils/twilio")
const dotenv = require("dotenv");
const axios = require("axios");
const mongoose = require("mongoose");
const { OAuth2Client } = require('google-auth-library');

dotenv.config();



exports.googleSignIn = async (req, res) => {
  try {
    const { idToken, googleId, email, displayName, photoUrl } = req.body;

    // Validation
    if (!idToken || !googleId || !email) {
      return error(res, "Missing required Google authentication data", 400);
    }

    // Verify the Google ID token
    let googlePayload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      googlePayload = ticket.getPayload();
      
      // Verify the email matches
      if (googlePayload.email !== email || googlePayload.sub !== googleId) {
        return error(res, "Invalid Google authentication", 401);
      }
    } catch (verifyError) {
      console.error("Google token verification failed:", verifyError);
      return error(res, "Invalid Google token", 401);
    }

    // Check if user exists with this email
    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      // User exists - update Google info if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        user.photoUrl = photoUrl || user.photoUrl;
        user.emailVerified = true; // Google emails are verified
        await user.save();
      }

      // Check if account is active
      if (!user.isActive) {
        return error(res, "Your account has been deactivated. Please contact support.", 403);
      }

      // Generate token
      const token = signJwt({ 
        uid: String(user._id), 
        email: user.email, 
        role: user.role 
      });

      return success(res, "Login successful", {
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          phoneVerified: user.phoneVerified,
          emailVerified: user.emailVerified,
          photoUrl: user.photoUrl,
        },
      });

    } else {
      // User doesn't exist - create new account
      const names = displayName ? displayName.split(' ') : ['User', ''];
      const firstName = names[0] || 'User';
      const lastName = names.slice(1).join(' ') || '';

      const newUser = await User.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        googleId: googleId,
        photoUrl: photoUrl || '',
        role: "user",
        phoneVerified: false,
        emailVerified: true, // Google emails are verified
        isActive: true,
        // No password needed for Google sign-in users
      });

      // Generate token
      const token = signJwt({ 
        uid: String(newUser._id), 
        email: newUser.email, 
        role: newUser.role 
      });

      return success(res, "Account created successfully", {
        token,
        user: {
          id: newUser._id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          phoneNumber: newUser.phoneNumber,
          role: newUser.role,
          phoneVerified: newUser.phoneVerified,
          emailVerified: newUser.emailVerified,
          photoUrl: newUser.photoUrl,
        },
      }, 201);
    }
  } catch (e) {
    console.error("Google sign-in error:", e);
    return error(res, "Google sign-in failed. Please try again.", 500);
  }
};





exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, role } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      return error(res, "First name, last name, email, phone number, and password are required", 400);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return error(res, "Invalid email format", 400);
    }

    // Password strength validation
    if (password.length < 8) {
      return error(res, "Password must be at least 8 characters long", 400);
    }

    // Phone number validation (basic check)
    const phoneRegex = /^\+?[\d\s-()]+$/;
    if (!phoneRegex.test(phoneNumber)) {
      return error(res, "Invalid phone number format", 400);
    }

    // Role validation - prevent unauthorized admin creation
    if (role && role === "admin") {
      return error(res, "Cannot create admin account through registration", 403);
    }

    // Check existing user
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return error(res, "Email already in use", 409);
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return error(res, "Phone number already in use", 409);
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user with OTP
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phoneNumber: phoneNumber.trim(),
      role: "user", // Always default to user
      phoneVerified: false,
      emailVerified: false,
      phoneOtp: otp,
      phoneOtpExpires: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send OTP via SMS
    try {
      await sendSMS({
        to: phoneNumber,
        message: `Your verification code is: ${otp}. This code will expire in 5 minutes.`
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      // Note: User is already created, so we don't fail the registration
      // They can request a new OTP later
    }

    return success(res, "Registration successful. Verification code sent to your phone.", {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      role: user.role,
    }, 201);
  } catch (e) {
    console.error("Registration error:", e);
    
    if (e.code === 11000) {
      if (e.keyPattern?.email) return error(res, "Email already in use", 409);
      if (e.keyPattern?.phoneNumber) return error(res, "Phone number already in use", 409);
      return error(res, "Duplicate field value", 409);
    }
    
    return error(res, "Registration failed. Please try again.", 500);
  }
};



// ============================================
// LOGIN
// ============================================



exports.login = async (req, res) => {
  try {
    const { email, phoneNumber, password } = req.body;

    // Validation - must provide either email or phone
    if (!password) {
      return error(res, "Password is required", 400);
    }

    if (!email && !phoneNumber) {
      return error(res, "Email or phone number is required", 400);
    }

    // Build query to find user by email OR phone number
    const query = {};
    if (email) {
      query.email = email.toLowerCase().trim();
    }
    if (phoneNumber) {
      // If both are provided, search by either
      if (email) {
        query.$or = [
          { email: email.toLowerCase().trim() },
          { phoneNumber: phoneNumber.trim() }
        ];
        delete query.email;
      } else {
        query.phoneNumber = phoneNumber.trim();
      }
    }

    // Find user
    const user = await User.findOne(query);
    if (!user) {
      return error(res, "Invalid credentials", 401);
    }

    // Check if account is active
    if (!user.isActive) {
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return error(res, "Invalid credentials", 401);
    }

    // Generate token
    const token = signJwt({ 
      uid: String(user._id), 
      email: user.email, 
      role: user.role 
    });

    return success(res, "Login successful", {
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    return error(res, "Login failed. Please try again.", 500);
  }
};


// ============================================
// USER MANAGEMENT (Admin only)
// ============================================


exports.deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deactivation
    if (req.user.uid === userId) {
      return error(res, "Cannot deactivate your own account", 400);
    }

    const user = await User.findById(userId);
    if (!user) return error(res, "User not found", 404);

    // Prevent deactivating other admins
    if (user.role === "admin") {
      return error(res, "Cannot deactivate admin accounts", 403);
    }

    user.isActive = false;
    await user.save();

    return success(res, "User deactivated successfully", {
      id: user._id,
      email: user.email,
      isActive: user.isActive,
    });
  } catch (e) {
    console.error("Deactivate user error:", e);
    if (e.kind === 'ObjectId') return error(res, "Invalid user ID", 400);
    return error(res, "Failed to deactivate user", 500);
  }
};



exports.activateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return error(res, "User not found", 404);

    user.isActive = true;
    await user.save();

    return success(res, "User activated successfully", {
      id: user._id,
      email: user.email,
      isActive: user.isActive,
    });
  } catch (e) {
    console.error("Activate user error:", e);
    if (e.kind === 'ObjectId') return error(res, "Invalid user ID", 400);
    return error(res, "Failed to activate user", 500);
  }
};



// ============================================
// PASSWORD RESET
// ============================================


exports.requestPasswordReset = async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return error(res, "Email or phone number is required", 400);
    }

    if (email && phoneNumber) {
      return error(res, "Please provide either email or phone number, not both", 400);
    }

    let user;
    let resetMethod;

    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
      resetMethod = "email";
    } else {
      user = await User.findOne({ phoneNumber: phoneNumber.trim() });
      resetMethod = "phone";
    }

    console.log('Reset request - Method:', resetMethod);
    console.log('User found:', !!user);
    console.log('User active:', user?.isActive);

    if (user && user.isActive) {
      if (resetMethod === "email") {
        // ✅ Email: Use your own token system
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordTokenHash = await hashToken(token);
        user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        user.resetPasswordMethod = 'custom_token'; // Mark as custom token
        await user.save();

        await sendEmail({
          to: email,
          subject: "Password Reset Request",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Password Reset Request</h2>
              <p>You requested a password reset.</p>
              <p>Your password reset code is:</p>
              <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <h1 style="color: #8B4513; margin: 0; font-size: 36px; letter-spacing: 5px;">${token}</h1>
              </div>
              <p>This code will expire in <strong>30 minutes</strong>.</p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `,
        });
        console.log('✅ Email sent successfully to:', email);
      } else {
        // ✅ Phone: Use Twilio Verify (Twilio generates the code)
        console.log('📱 Attempting SMS to:', phoneNumber);
        
        await sendVerificationSMS({
          to: phoneNumber
        });
        
        // ✅ Mark that this user is using Twilio Verify
        user.resetPasswordMethod = 'twilio_verify';
        user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
        
        console.log('✅ SMS sent successfully via Twilio Verify');
      }
    } else {
      console.log('⚠️ User not found or inactive - no message sent');
    }

    return success(
      res,
      resetMethod === "email"
        ? "If the email exists, a reset code has been sent."
        : "If the phone number exists, a reset code has been sent."
    );
  } catch (e) {
    console.error("❌ Password reset request error:", e);
    return error(res, "Failed to process password reset request", 500);
  }
};




exports.resetPassword = async (req, res) => {
  try {
    const { email, phoneNumber, token, password } = req.body;

    console.log('📥 Reset password request received');
    console.log('📧 Email:', email);
    console.log('🔑 Token from request:', token);
    console.log('🔑 Token type:', typeof token);
    console.log('🔑 Token length:', token?.length);

    // Validation
    if (!token || !password) {
      return error(res, "Token and new password are required", 400);
    }

    if (!email && !phoneNumber) {
      return error(res, "Email or phone number is required", 400);
    }

    if (email && phoneNumber) {
      return error(res, "Please provide either email or phone number, not both", 400);
    }

    if (password.length < 8) {
      return error(res, "Password must be at least 8 characters long", 400);
    }

    let user;

    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
      console.log('🔍 User found:', !!user);
      
      if (user) {
        console.log('📊 User details:');
        console.log('   - ID:', user._id);
        console.log('   - Reset method:', user.resetPasswordMethod);
        console.log('   - Has token hash:', !!user.resetPasswordTokenHash);
        console.log('   - Token hash:', user.resetPasswordTokenHash);
        console.log('   - Expires at:', user.resetPasswordExpiresAt);
        console.log('   - Now:', new Date());
        console.log('   - Is expired:', user.resetPasswordExpiresAt < new Date());
      }
    } else {
      user = await User.findOne({ phoneNumber: phoneNumber.trim() });
      console.log('🔍 User found by phone:', !!user);
    }

    if (!user) {
      console.log('❌ User not found');
      return error(res, "User not found", 404);
    }

    if (!user.isActive) {
      console.log('❌ User account inactive');
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    // Check expiration
    if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
      console.log('⏰ Token expired or missing');
      
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpiresAt = null;
      user.resetPasswordMethod = null;
      await user.save();
      return error(res, "Reset token has expired. Please request a new one.", 400);
    }

    // Verify based on method
    if (phoneNumber && user.resetPasswordMethod === 'twilio_verify') {
      console.log('🔐 Verifying via Twilio Verify...');
      
      const verificationResult = await verifyTwilioCode({
        to: phoneNumber,
        code: token
      });

      if (!verificationResult.success) {
        return error(res, "Invalid or expired verification code", 400);
      }
      
      console.log('✅ Twilio verification successful');
    } else {
      console.log('🔐 Verifying via compareToken...');
      console.log('   Token from user:', token);
      console.log('   Hash from DB:', user.resetPasswordTokenHash);
      
      if (!user.resetPasswordTokenHash) {
        console.log('❌ No reset token hash found');
        return error(res, "Invalid or expired reset token", 400);
      }

      // Test the comparison
      console.log('🧪 Testing bcrypt comparison...');
      const isTokenValid = await compareToken(token, user.resetPasswordTokenHash);
      console.log('📊 Comparison result:', isTokenValid);
      
      if (!isTokenValid) {
        console.log('❌ Token does not match');
        console.log('💡 Debug: Try requesting a fresh password reset');
        return error(res, "Invalid reset token", 400);
      }
      
      console.log('✅ Token verification successful');
    }

    console.log('🔄 Updating password...');

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.resetPasswordMethod = null;
    await user.save();

    console.log('✅ Password updated successfully');

    return success(res, "Password updated successfully");
  } catch (e) {
    console.error("❌ Password reset error:", e);
    console.error("Stack:", e.stack);
    return error(res, "Failed to reset password", 500);
  }
};


// exports.requestPasswordReset = async (req, res) => {
//   try {
//     const { email, phoneNumber } = req.body;

//     if (!email && !phoneNumber) {
//       return error(res, "Email or phone number is required", 400);
//     }

//     if (email && phoneNumber) {
//       return error(res, "Please provide either email or phone number, not both", 400);
//     }

//     let user;
//     let resetMethod;

//     if (email) {
//       user = await User.findOne({ email: email.toLowerCase().trim() });
//       resetMethod = "email";
//     } else {
//       user = await User.findOne({ phoneNumber: phoneNumber.trim() });
//       resetMethod = "phone";
//     }

//     // Log for debugging
//     console.log('Reset request - Method:', resetMethod);
//     console.log('User found:', !!user);
//     console.log('User active:', user?.isActive);

//     if (user && user.isActive) {
//       const token = Math.floor(100000 + Math.random() * 900000).toString();
//       user.resetPasswordTokenHash = await hashToken(token);
//       user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
//       await user.save();

//       if (resetMethod === "email") {
//         await sendEmail({
//           to: email,
//           subject: "Password Reset Request",
//           html: `
//             <p>You requested a password reset.</p>
//             <p>Your password reset code is:</p>
//             <h2>${token}</h2>
//             <p>This code will expire in 30 minutes.</p>
//             <p>If you didn't request this, please ignore this email.</p>
//           `,
//         });
//         console.log('Email sent successfully');
//       } else {
//         console.log('Attempting SMS to:', phoneNumber);
//         await sendSMS({
//           to: phoneNumber,
//           message: `Your password reset code is: ${token}. This code will expire in 30 minutes. If you didn't request this, please ignore this message.`,
//         });
//         console.log('SMS sent successfully');
//       }
//     } else {
//       console.log('User not found or inactive - no message sent');
//     }

//     return success(
//       res,
//       resetMethod === "email"
//         ? "If the email exists, a reset code has been sent."
//         : "If the phone number exists, a reset code has been sent."
//     );
//   } catch (e) {
//     console.error("Password reset request error:", e);
//     return error(res, "Failed to process password reset request", 500);
//   }
// };



// exports.resetPassword = async (req, res) => {
//   try {
//     const { email, phoneNumber, token, password } = req.body;

//     // Validation
//     if (!token || !password) {
//       return error(res, "Token and new password are required", 400);
//     }

//     if (!email && !phoneNumber) {
//       return error(res, "Email or phone number is required", 400);
//     }

//     if (email && phoneNumber) {
//       return error(res, "Please provide either email or phone number, not both", 400);
//     }

//     if (password.length < 8) {
//       return error(res, "Password must be at least 8 characters long", 400);
//     }

//     let user;

//     // Find user by email or phone
//     if (email) {
//       user = await User.findOne({ email: email.toLowerCase().trim() });
//     } else {
//       user = await User.findOne({ phoneNumber: phoneNumber.trim() });
//     }

//     if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpiresAt) {
//       return error(res, "Invalid or expired reset token", 400);
//     }

//     // Check if account is active
//     if (!user.isActive) {
//       return error(res, "Your account has been deactivated. Please contact support.", 403);
//     }

//     // Check expiration
//     if (user.resetPasswordExpiresAt < new Date()) {
//       user.resetPasswordTokenHash = null;
//       user.resetPasswordExpiresAt = null;
//       await user.save();
//       return error(res, "Reset token has expired. Please request a new one.", 400);
//     }

//     // Verify token
//     const isTokenValid = await compareToken(token, user.resetPasswordTokenHash);
//     if (!isTokenValid) {
//       return error(res, "Invalid reset token", 400);
//     }

//     // Update password
//     const salt = await bcrypt.genSalt(10);
//     user.passwordHash = await bcrypt.hash(password, salt);
//     user.resetPasswordTokenHash = null;
//     user.resetPasswordExpiresAt = null;
//     await user.save();

//     return success(res, "Password updated successfully");
//   } catch (e) {
//     console.error("Password reset error:", e);
//     return error(res, "Failed to reset password", 500);
//   }
// };


// ============================================
// EMAIL VERIFICATION
// ============================================
exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) return error(res, "Email is required", 400);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return error(res, "User not found", 404);

    if (!user.isActive) {
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    if (user.emailVerified) {
      return error(res, "Email is already verified", 400);
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = otp;
    user.emailOtpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await user.save();

    await sendEmail({
      to: email,
      subject: "Email Verification Code",
      html: `
        <p>Your email verification code is:</p>
        <h2>${otp}</h2>
        <p>This code will expire in 5 minutes.</p>
      `,
    });

    return success(res, "Verification code sent to email");
  } catch (err) {
    console.error("Send email OTP error:", err);
    return error(res, "Failed to send verification code", 500);
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return error(res, "Email and verification code are required", 400);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return error(res, "User not found", 404);

    if (!user.isActive) {
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    if (user.emailVerified) {
      return error(res, "Email is already verified", 400);
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
      return error(res, "No verification code found. Please request a new one.", 400);
    }

    if (user.emailOtpExpires < new Date()) {
      user.emailOtp = null;
      user.emailOtpExpires = null;
      await user.save();
      return error(res, "Verification code has expired. Please request a new one.", 400);
    }

    if (user.emailOtp !== code.trim()) {
      return error(res, "Invalid verification code", 401);
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpires = null;
    await user.save();

    return success(res, "Email verified successfully", {
      id: user._id,
      email: user.email,
      emailVerified: user.emailVerified,
    });
  } catch (err) {
    console.error("Verify email OTP error:", err);
    return error(res, "Failed to verify email", 500);
  }
};




// ============================================
// PHONE VERIFICATION
// ============================================



exports.sendPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) return error(res, "Phone number is required", 400);

    const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
    if (!user) return error(res, "User not found", 404);

    if (!user.isActive) {
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    if (user.phoneVerified) {
      return error(res, "Phone number is already verified", 400);
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneOtp = otp;
    user.phoneOtpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await user.save();

    await sendSMS({
      to: phoneNumber,
      message: `Your verification code is: ${otp}. This code will expire in 5 minutes.`
    });

    return success(res, "Verification code sent to phone");
  } catch (err) {
    console.error("Send phone OTP error:", err);
    return error(res, "Failed to send verification code", 500);
  }
};




exports.verifyPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    
    if (!phoneNumber || !code) {
      return error(res, "Phone number and verification code are required", 400);
    }

    const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
    if (!user) return error(res, "User not found", 404);

    if (!user.isActive) {
      return error(res, "Your account has been deactivated. Please contact support.", 403);
    }

    if (user.phoneVerified) {
      return error(res, "Phone number is already verified", 400);
    }

    if (!user.phoneOtp || !user.phoneOtpExpires) {
      return error(res, "No verification code found. Please request a new one.", 400);
    }

    if (user.phoneOtpExpires < new Date()) {
      user.phoneOtp = null;
      user.phoneOtpExpires = null;
      await user.save();
      return error(res, "Verification code has expired. Please request a new one.", 400);
    }

    if (user.phoneOtp !== code.trim()) {
      return error(res, "Invalid verification code", 401);
    }

    // Mark phone as verified
    user.phoneVerified = true;
    user.phoneOtp = null;
    user.phoneOtpExpires = null;
    await user.save();

    // Generate token for automatic login
    const token = signJwt({ 
      uid: String(user._id), 
      email: user.email, 
      role: user.role 
    });

    return success(res, "Phone verified successfully", {
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Verify phone OTP error:", err);
    return error(res, "Failed to verify phone number", 500);
  }
};




// ============================================
// USER RETRIEVAL
// ============================================
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all' } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -resetPasswordTokenHash -emailOtp -phoneOtp')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      User.countDocuments(query)
    ]);

    return success(res, "Users retrieved successfully", {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      users: users.map(user => ({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isActive: user.isActive,
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }))
    });
  } catch (e) {
    console.error("Get all users error:", e);
    return error(res, "Failed to retrieve users", 500);
  }
};

exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return error(res, "User ID is required", 400);
    }
    
    const user = await User.findById(id)
      .select('-passwordHash -resetPasswordTokenHash -emailOtp -phoneOtp');

    if (!user) return error(res, "User not found", 404);

    return success(res, "User retrieved successfully", {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isActive: user.isActive,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (e) {
    console.error("Get user error:", e);
    if (e.kind === 'ObjectId') return error(res, "Invalid user ID format", 400);
    return error(res, "Failed to retrieve user", 500);
  }
};



exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return error(res, "User ID is required", 400);
    }
    
    const user = await User.findById(id)
      .select('-passwordHash -resetPasswordTokenHash -emailOtp -phoneOtp');

    if (!user) {
      return error(res, "User not found", 404);
    }

    // Check if account is active
    if (!user.isActive) {
      return error(res, "Account is deactivated", 403);
    }

    return success(res, "Profile retrieved successfully", {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (e) {
    console.error("Get profile error:", e);
    if (e.kind === 'ObjectId') {
      return error(res, "Invalid user ID format", 400);
    }
    return error(res, "Failed to retrieve profile. Please try again.", 500);
  }
};





/**
 * Update User Profile
 * PATCH /api/users/:id
 * Requires authentication
 */
exports.updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phoneNumber } = req.body;

    // Validation - ID required
    if (!id) {
      return error(res, "User ID is required", 400);
    }

    // Validation - at least one field must be provided
    if (!firstName && !lastName && !email && !phoneNumber) {
      return error(res, "At least one field is required to update", 400);
    }

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return error(res, "User not found", 404);
    }

    // Check if account is active
    if (!user.isActive) {
      return error(res, "Cannot update profile. Account is deactivated.", 403);
    }

    // Handle email change
    if (email && email.toLowerCase().trim() !== user.email) {
      const emailExists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: id },
      });

      if (emailExists) {
        return error(res, "Email is already in use", 409);
      }

      user.email = email.toLowerCase().trim();
      user.emailVerified = false;
    }

    // Handle phone change
    if (phoneNumber && phoneNumber.trim() !== user.phoneNumber) {
      const phoneExists = await User.findOne({
        phoneNumber: phoneNumber.trim(),
        _id: { $ne: id },
      });

      if (phoneExists) {
        return error(res, "Phone number is already in use", 409);
      }

      user.phoneNumber = phoneNumber.trim();
      user.phoneVerified = false;
    }

    // Update other fields
    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();

    await user.save();

    return success(res, "Profile updated successfully", {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    });
  } catch (e) {
    console.error("Update profile error:", e);
    if (e.kind === "ObjectId") {
      return error(res, "Invalid user ID", 400);
    }
    return error(res, "Failed to update profile", 500);
  }
};


/**
 * Delete User Account
 * DELETE /api/users/:id
 * Requires authentication and password confirmation
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Validation
    if (!id) {
      return error(res, "User ID is required", 400);
    }

    if (!password) {
      return error(res, "Password is required to delete account", 400);
    }

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return error(res, "User not found", 404);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return error(res, "Invalid password. Account deletion cancelled.", 401);
    }

    // Permanently delete account
    await User.findByIdAndDelete(id);

    return success(res, "Account deleted successfully. We're sorry to see you go.", {
      deletedAt: new Date(),
    });
  } catch (e) {
    console.error("Delete account error:", e);
    if (e.kind === "ObjectId") {
      return error(res, "Invalid user ID", 400);
    }
    return error(res, "Failed to delete account", 500);
  }
};



