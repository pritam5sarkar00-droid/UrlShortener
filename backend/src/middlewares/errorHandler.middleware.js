import { sendError } from '../utils/htmlError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.status >= 500 || !err.status) {
    console.error(err);
  }
  sendError(req, res, err.status || 500, 'Something went wrong', err.message || 'An unexpected error occurred.');
}

export function notFoundHandler(req, res) {
  sendError(req, res, 404, 'Not found', "This page doesn't exist.");
}
