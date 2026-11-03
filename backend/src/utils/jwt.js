const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRY = '7d';

/**
 * Sign a token for a user.
 * @param {number} userId
 * @param {string} email
 * @returns {string} JWT
 */
function signToken(userId, email) {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT. Returns { id, email } or throws.
 * @param {string} token
 * @returns {{ id: number, email: string }}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

module.exports = { signToken, verifyToken, JWT_SECRET, JWT_EXPIRY };
