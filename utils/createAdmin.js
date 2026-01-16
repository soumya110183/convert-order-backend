import User from "../models/User.js";
import { hashPassword } from "./password.js";

const createAdminIfNotExists = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("Admin credentials not set in environment variables");
  }

  const existingAdmin = await User.findOne({ email: adminEmail });

  if (existingAdmin) {
    // Admin already exists — do nothing
    return;
  }

  const hashedPassword = await hashPassword(adminPassword);

  await User.create({
    email: adminEmail,
    password: hashedPassword,
    role: "admin",
    isActive: true,
  });

  console.log("✅ Admin user created from environment variables");
};

export default createAdminIfNotExists;
