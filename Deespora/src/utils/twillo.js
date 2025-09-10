// twilio.js (helper file)
import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendVerification = async (phoneNumber) => {
  return client.verify.v2.services(process.env.TWILIO_VERIFY_SID)
    .verifications
    .create({ to: phoneNumber, channel: "sms" });
};

export const checkVerification = async (phoneNumber, code) => {
  return client.verify.v2.services(process.env.TWILIO_VERIFY_SID)
    .verificationChecks
    .create({ to: phoneNumber, code });
};
