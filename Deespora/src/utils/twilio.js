const twilio = require('twilio');

// Use live credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACca4318bea5bc43a360f7d9672eed2e02';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'ef11ebd918facd23c869d6bd91d60c7e';
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '+14787806478';

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