import bcrypt from "bcryptjs";
export const hashPassword = async (password) => bcrypt.hash(password, 10);
export const verifyPassword = async (password, hash) =>
  bcrypt.compare(password, hash);
