const jwtUtils = require('../utils/jwt');
const { AppError } = require('../utils/errors');

/**
 * JWT authentication middleware.
 * Reads Authorization: Bearer <token>, decodes it, and attaches req.user = { id, email }.
 * On failure, calls next() with an AppError (UNAUTHORIZED).
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError({
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: '缺少认证信息',
    }));
  }

  const token = header.slice(7);
  const user = jwtUtils.verifyToken(token);
  if (!user) {
    return next(new AppError({
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: '认证无效或已过期',
    }));
  }

  req.user = user;
  next();
}

module.exports = authMiddleware;
