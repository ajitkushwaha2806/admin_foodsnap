import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "foodsnap-super-secret-jwt-key-2026";
const JWT_EXPIRES_IN = "30d";

export function signToken(user) {
  const payload = {
    userId: user._id ? user._id.toString() : user.id,
    phone: user.phone,
    name: user.name || "",
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token) {
  try {
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function extractTokenFromRequest(request) {
  const cookieToken = request.cookies?.get?.("token")?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

export function getAuthUser(request) {
  const token = extractTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

const jwtService = {
  signToken,
  verifyToken,
  extractTokenFromRequest,
  getAuthUser,
};

export default jwtService;
