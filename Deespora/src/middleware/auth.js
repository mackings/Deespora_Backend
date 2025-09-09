import { verifyJwt } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const token = auth.split(" ")[1];
    const decoded = verifyJwt(token);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
