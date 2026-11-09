/**
 * Formats a short booking ID combining the branch name and a shortened UUID.
 * Examples:
 * - KPHB + 228c64cf-734b-... => 'kphb228c64cf'
 * - Jubilee Hills + 71246f54-6a58-... => 'jubileehills71246f54'
 * - Nanakramguda + bb68c1df-... => 'nanakramgudabb68c1df'
 * - Kokapet + 8af5f7b3-... => 'kokapet8af5f7b3'
 */
function formatShortBookingId(branchName, rawId) {
  if (!rawId) return '';
  const strId = String(rawId).trim();
  // If it's already in the short formatted format, return as is
  if (/^[a-z]+[0-9a-f]{6,12}$/i.test(strId)) {
    return strId.toLowerCase();
  }
  const prefix = String(branchName || 'kphb').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanUuid = strId.replace(/[^a-f0-9]/gi, '').toLowerCase();
  const shortUuid = cleanUuid.slice(0, 8);
  return `${prefix}${shortUuid}`;
}

/**
 * Resolves a booking param (which may be a full UUID or a short ID like 'kphb228c64cf')
 * into the canonical PostgreSQL UUID.
 */
async function resolveBookingId(pool, paramId) {
  if (!paramId) return null;
  const str = String(paramId).trim();
  // Standard 36-char UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str;
  }
  // Extract the hex part from the end (e.g. 'kphb228c64cf' -> '228c64cf')
  const hexPart = str.replace(/^[a-z_ -]+/i, '').replace(/[^a-f0-9]/gi, '').toLowerCase();
  if (hexPart.length >= 4) {
    const match = await pool.query(
      `SELECT id FROM bookings WHERE REPLACE(id::text, '-', '') ILIKE $1 || '%' LIMIT 1`,
      [hexPart]
    );
    if (match.rowCount) return match.rows[0].id;
  }
  return str;
}

module.exports = {
  formatShortBookingId,
  resolveBookingId,
};
