export function success(res, message, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function error(res, message, statusCode = 500, details = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}