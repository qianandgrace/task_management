/**
 * Global error-handling middleware (must be last Express middleware).
 * Catches thrown errors and returns unified JSON:
 *   { error: { code, message } }
 */
function errorHandler(err, req, res, _next) {
  // If it's our AppError or has httpStatus/code shape
  const statusCode = err.httpStatus || 500;
  const body = err.code
    ? { error: { code: err.code, message: err.message } }
    : { error: { code: 'INTERNAL_ERROR', message: statusCode === 500 ? '服务器内部错误' : err.message } };

  // Log internal details on server (never leak to client)
  if (statusCode >= 500) {
    console.error('[Server Error]', err);
  }

  return res.status(statusCode).json(body);
}

module.exports = errorHandler;
