/**
 * Custom error classes used throughout the application.
 */

class AppError extends Error {
  constructor({ code, httpStatus, message }) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

module.exports = { AppError };
