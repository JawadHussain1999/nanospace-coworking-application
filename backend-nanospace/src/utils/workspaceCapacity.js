function calculateWorkspaceCapacity(capacityValue, bookedSeatsValue, workspaceStatus, isHistoricalDate = false) {
  const capacity = Math.max(1, Number(capacityValue) || 1);
  const bookedSeats = Math.max(0, Number(bookedSeatsValue) || 0);
  const availableCapacity = Math.max(0, capacity - bookedSeats);
  let status = 'AVAILABLE';

  if (bookedSeats >= capacity) status = 'BOOKED';
  else if (!isHistoricalDate && workspaceStatus === 'MAINTENANCE') status = 'OCCUPIED';
  else if (!isHistoricalDate && workspaceStatus === 'RESERVED') status = 'BOOKED';
  else if (!isHistoricalDate && workspaceStatus === 'OCCUPIED' && bookedSeats === 0) status = 'OCCUPIED';

  return {
    capacity,
    bookedSeats,
    availableCapacity: status === 'AVAILABLE' ? availableCapacity : 0,
    status,
  };
}

module.exports = { calculateWorkspaceCapacity };
