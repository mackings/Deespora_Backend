function success(res, message, data = {}, statusCode = 200) {
  // Always keep success codes in the 2xx range
  if (statusCode < 200 || statusCode >= 300) {
    statusCode = 200; // fallback to prevent wrong use
  }

  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function error(res, message, statusCode = 400, details = null) {
  // Default to 400 for client errors instead of 200
  if (statusCode >= 200 && statusCode < 300) {
    statusCode = 400;
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

module.exports = { success, error };


