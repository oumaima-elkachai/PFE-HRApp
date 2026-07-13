const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "pfe-rh-secret-local-2026";

const authentifier = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ succes: false, erreur: "Token manquant" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ succes: false, erreur: "Token invalide ou expire" });
  }
};

const autoriser = (...rolesAutorises) => {
  return (req, res, next) => {
    if (!rolesAutorises.includes(req.user.role)) {
      return res.status(403).json({
        succes: false,
        erreur: "Acces refuse. Role requis : " + rolesAutorises.join(" ou "),
      });
    }
    next();
  };
};

module.exports = { authentifier, autoriser };