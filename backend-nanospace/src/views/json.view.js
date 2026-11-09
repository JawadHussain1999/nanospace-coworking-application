function data(payload) {
  return { data: payload };
}

function error(message) {
  return { error: message };
}

module.exports = { data, error };
