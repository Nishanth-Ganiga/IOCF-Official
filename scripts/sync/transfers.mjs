// Players who have moved to another board. The sheet may still list them (or their awards) under the board they left; here they are
// moved: their player entry, with the awards recorded on it, goes to the new board and disappears from the old one. This is applied on
// every sync, so it keeps holding until the line is removed (remove it if the player ever returns). Board names as in the sheet's tabs.
// `into` names the entry on the new board when it is spelt differently.
export const TRANSFERS = [
  { name: 'Bhavin Kumar', from: 'Pakistan', to: 'South Africa' },
  // Adithya Mahajan ("Aditya" in the scorer exports) played for these boards and is now in the USA
  { name: 'Adithya Mahajan', from: 'Bangladesh', to: 'USA' },
  { name: 'Adithya Mahajan', from: 'Qatar', to: 'USA' },
  { name: 'Adithya Mahajan', from: 'South Africa', to: 'USA' },
  { name: 'Siddharth V Jain', from: 'South Africa', to: 'Bangladesh', into: 'Sidd V Jain' },
  { name: 'Karthik Varma', from: 'Ireland', to: 'England', into: 'Karthik Verma' },
  { name: 'Sai Naveen', from: 'Australia', to: 'Bangladesh' },
  { name: 'Aniket Gavit', from: 'England', to: 'New Zealand' },
  { name: 'Mudasir Ali', from: 'Qatar', to: 'Pakistan' },
  { name: 'Harsh Dubey', from: 'Bangladesh', to: 'USA' },
  { name: 'Harsh Dubey', from: 'Australia', to: 'USA' },
  { name: 'Muhammad Touqeer', from: 'Qatar', to: 'Spain' },
  { name: 'Waqas Mughal', from: 'Bangladesh', to: 'Nepal' },
  { name: 'Waqas Mughal', from: 'Australia', to: 'Nepal' }, // his Australia entry is an earlier board
  { name: 'Rima Naskar Sona', from: 'Pakistan', to: 'Australia' },
  { name: 'Rima Roy', from: 'Pakistan', to: 'Australia', into: 'Rima Naskar Sona' },
];

// The same person listed twice on one board under different spellings: the entries are merged into `keep` (with their awards).
export const MERGES = [
  { board: "Australia", keep: "Anand Ajikumar", drop: ["Anandan Ajikumar"] },
  { board: "Australia", keep: "Muhammad Noor", drop: ["Mohammaed Noor"] },
  { board: "Bangladesh", keep: "Tanusri Dutta", drop: ["Tansuri Dutta"] },
  { board: "Bangladesh", keep: "Princhi Pratim Bora", drop: ["Princhi Bora", "Princhi"] },
  { board: "Canada", keep: "Shahnawaz Ms", drop: ["Sahnavaz"] },
  { board: "India", keep: "Farhan", drop: ["Farhaan"] },
  { board: "Italy", keep: "Subaida Subi", drop: ["Subi"] },
  { board: "Italy", keep: "Renjini", drop: ["Rejini"] },
  { board: "Netherlands", keep: "Dipak Das", drop: ["Deepak Das"] },
  { board: "Pakistan", keep: "Rima Naskar Sona", drop: ["Rima Roy"] },
  { board: "Portugal", keep: "Mubashir", drop: ["Mubhashir"] },
  { board: "Scotland", keep: "Thebseer", drop: ["Thesbeer"] },
  { board: "Scotland", keep: "Abhinand", drop: ["Abhi"] },
  { board: "South Africa", keep: "Rahul Mahapatra", drop: ["Rahul Mohapatra"] },
  { board: "South Africa", keep: "Saketh balne", drop: ["Saketh B"] },
  { board: "South Africa", keep: "Shajahan", drop: ["Shahjahan"] },
  { board: "Zimbabwe", keep: "Jyothishman Das", drop: ["Jyotishman Das"] },
  { board: "Zimbabwe", keep: "Mriganka Marle", drop: ["Mriganka Marley"] },
];

// An umpire listed under the same name on several boards is merged into one entry. It sits on the board where he officiated most, unless
// he is named here: the board he is on now. Applies to the umpire list only.
export const UMPIRE_BOARDS = { yasiniqbal: 'Bangladesh' };
