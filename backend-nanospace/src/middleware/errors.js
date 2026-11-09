function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === '23505') return res.status(409).json({ error: 'A record with this value already exists.' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist or cannot be removed.' });
  if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: 'Invalid field value.' });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : (err.message || 'Internal server error.')
  });
}

module.exports = { notFound, errorHandler };
