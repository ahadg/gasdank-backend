import crypto from 'crypto';
import bcrypt from 'bcrypt';
import User from '../models/User';

export const makeResetToken = () => crypto.randomBytes(32).toString('hex');

export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

export async function setUserResetToken(email: string) {
  const rawToken = makeResetToken();
  const hashed = hashToken(rawToken);

  const user = await User.findOneAndUpdate(
    { email },
    {
      resetPasswordToken: hashed,
      resetPasswordExpires: Date.now() + 60 * 60 * 1000, // 1 h
    },
    { new: true }
  );
  return { user, rawToken };
}

export async function verifyTokenAndUpdatePassword(
  rawToken: string,
  newPassword: string
) {
  const hashed = hashToken(rawToken);
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) return null;

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.updated_at = new Date();
  await user.save();
  return user;
}

