import jwt from "jsonwebtoken";

export const generateToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

