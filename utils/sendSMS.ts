// utils/sendSMS.ts

import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);


export const sendSMS = async ({
  to,
  message,
}: {
  to: string;
  message: string;
}): Promise<{
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
}> => {
  try {
    const formattedPhone = formatPhoneNumber(to);
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: formattedPhone,
    });

    return {
      success: true,
      sid: result.sid,
      status: result.status,
    };
  } catch (err: any) {
    console.error("SMS sending error:", err);
    return {
      success: false,
      error: err.message,
    };
  }
};

// Format phone number for Twilio (ensure it starts with country code)
export const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '';

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // If it doesn't start with country code, assume US (+1)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }

  return cleaned;
}