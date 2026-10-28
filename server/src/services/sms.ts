import crypto from 'crypto';
import { SERVER_CONFIG } from '../config.js';

export interface SmsSender {
  sendOtp(phone: string, code: string): Promise<boolean>;
}

export class DemoSmsSender implements SmsSender {
  async sendOtp(phone: string, code: string): Promise<boolean> {
    console.log(`[SMS] Demo OTP for ${phone}: ${code}`);
    return true;
  }
}

export const smsSender: SmsSender = new DemoSmsSender();

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
