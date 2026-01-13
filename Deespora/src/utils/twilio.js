const twilio = require('twilio');


const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID; 

const client = twilio(accountSid, authToken);

exports.sendSMS = async ({ to, message }) => {
  try {
    const payload = {
      body: message,
      to: to
    };
    if (messagingServiceSid) {
      payload.messagingServiceSid = messagingServiceSid;
    } else {
      payload.from = twilioPhoneNumber;
    }
    const result = await client.messages.create(payload);
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
       // customCode: code,
      });

    console.log('✅ Verification SMS sent via Twilio Verify');
    console.log('Status:', verification.status);
    return { success: true, status: verification.status };
  } catch (error) {
    console.error('❌ Twilio Verify SMS error:', error);
    throw new Error(`Failed to send verification SMS: ${error.message}`);
  }
};



exports.verifyTwilioCode = async ({ to, code }) => {
  try {
    const verificationCheck = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks
      .create({
        to: to,
        code: code
      });

    console.log('✅ Verification check completed');
    console.log('📱 Phone:', to);
    console.log('📊 Status:', verificationCheck.status);
    
    return {
      success: verificationCheck.status === 'approved',
      status: verificationCheck.status
    };
  } catch (error) {
    console.error('❌ Twilio verify check error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
