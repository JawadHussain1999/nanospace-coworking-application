import { createSlice } from '@reduxjs/toolkit';
import { inventory as defaultInventory, PARKING_INVENTORY_ID } from '../../data/inventory';

const inventorySlice = createSlice({
  name: 'inventory',
  initialState: defaultInventory,
  reducers: {
    hydrateInventory(state, action) {
      const savedInventory = action.payload;
      const parkingItem = defaultInventory.find((item) => item.id === PARKING_INVENTORY_ID);
      return parkingItem && !savedInventory.some((item) => item.id === PARKING_INVENTORY_ID)
        ? [...savedInventory, parkingItem]
        : savedInventory;
    },
    addInventoryItem(state, action) {
      state.push(action.payload);
    },
    updateInventoryItem(state, action) {
      const index = state.findIndex((item) => item.id === action.payload.id);
      if (index !== -1) state[index] = action.payload;
    },
  },
});

export const { hydrateInventory, addInventoryItem, updateInventoryItem } = inventorySlice.actions;
export default inventorySlice.reducer;
