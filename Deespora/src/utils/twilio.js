const twilio = require('twilio');

// Use live credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

const client = twilio(accountSid, authToken);

exports.sendSMS = async ({ to, message }) => {
  try {
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: to
    });
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('Twilio SMS Error:', error);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};