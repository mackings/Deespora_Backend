import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export async function sendEmail({ to, subject, html }) {
  // Create a reusable transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.FROM_EMAIL || "no-reply@example.com",
    to,
    subject,
    html,
  });

  // For Ethereal, preview URL is handy in dev
  // console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
  return info;
}
