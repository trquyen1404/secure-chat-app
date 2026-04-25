const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET; // Guaranteed set by server.js startup check
//ghghghgh
const auth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Token xác thực bị thiếu hoặc không đúng định dạng" });
    }
    const token = authHeader.slice(7); // Remove 'Bearer ' prefix cleanly
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
    }
    res.status(401).json({ error: "Token không hợp lệ." });
  }
};

module.exports = auth;
