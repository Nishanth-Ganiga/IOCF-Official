// Players who have moved to another board. The sheet may still list them (or their awards) under the board they left; here they are
// moved: their player entry, with the awards recorded on it, goes to the new board and disappears from the old one. This is applied on
// every sync, so it keeps holding until the line is removed (remove it if the player ever returns). Board names as in the sheet's tabs.
export const TRANSFERS = [
  { name: 'Bhavin Kumar', from: 'Pakistan', to: 'South Africa' },
  // Adithya Mahajan ("Aditya" in the scorer exports) played for these boards and is now in the USA
  { name: 'Adithya Mahajan', from: 'Bangladesh', to: 'USA' },
  { name: 'Adithya Mahajan', from: 'Qatar', to: 'USA' },
  { name: 'Adithya Mahajan', from: 'South Africa', to: 'USA' },
];
