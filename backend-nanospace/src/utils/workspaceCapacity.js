function isExclusiveWorkspaceType(workspaceType) {
  return /CONFERENCE|MEETING|BOARDROOM/i.test(String(workspaceType || ''));
}

function getPlanSeatCount(planDescription) {
  const match = String(planDescription || '').match(/\b(\d+)\s*[- ]?\s*seater\b/i);
  return match ? Number(match[1]) : 0;
}

function getReservedSeatCount(workspaceType, capacityValue, requestedSeatCount, planDescription) {
  const capacity = Math.max(1, Number(capacityValue) || 1);
  if (isExclusiveWorkspaceType(workspaceType)) return capacity;
  const planSeatCount = getPlanSeatCount(planDescription);
  if (planSeatCount > 0) return planSeatCount;
  return Math.max(1, Number(requestedSeatCount) || 1);
}

function calculateWorkspaceCapacity(
  capacityValue,
  bookedSeatsValue,
  workspaceStatus,
  isHistoricalDate = false,
  hasExactSchedule = false
) {
  const capacity = Math.max(1, Number(capacityValue) || 1);
  const bookedSeats = Math.max(0, Number(bookedSeatsValue) || 0);
  const availableCapacity = Math.max(0, capacity - bookedSeats);
  let status = 'AVAILABLE';

  if (bookedSeats >= capacity) status = 'BOOKED';
  else if (!isHistoricalDate && workspaceStatus === 'MAINTENANCE') status = 'OCCUPIED';
  else if (!isHistoricalDate && workspaceStatus === 'RESERVED') status = 'BOOKED';
  else if (!isHistoricalDate && !hasExactSchedule && workspaceStatus === 'OCCUPIED' && bookedSeats === 0) status = 'OCCUPIED';

  return {
    capacity,
    bookedSeats,
    availableCapacity: status === 'AVAILABLE' ? availableCapacity : 0,
    status,
  };
}

module.exports = {
  calculateWorkspaceCapacity,
  getPlanSeatCount,
  getReservedSeatCount,
  isExclusiveWorkspaceType,
};
