const twilio = require('twilio');


const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

const client = twilio(accountSid, authToken);

// exports.sendSMS = async ({ to, message }) => {
//   try {
//     const result = await client.messages.create({
//       body: message,
//       from: twilioPhoneNumber,
//       to: to
//     });
//     return { success: true, sid: result.sid };
//   } catch (error) {
//     console.error('Twilio SMS Error:', error);
//     throw new Error(`Failed to send SMS: ${error.message}`);
//   }
// };

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

// New method using Twilio Verify - automatically handles A2P 10DLC
exports.sendVerificationSMS = async ({ to, code }) => {
  try {
    const verification = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications
      .create({
        to: to,
        channel: 'sms',
        customCode: code,
      });

    console.log('✅ Verification SMS sent via Twilio Verify');
    console.log('Status:', verification.status);
    return { success: true, status: verification.status };
  } catch (error) {
    console.error('❌ Twilio Verify SMS error:', error);
    throw new Error(`Failed to send verification SMS: ${error.message}`);
  }
};
