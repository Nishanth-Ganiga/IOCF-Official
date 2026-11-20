// Players who have moved to another board. The sheet may still list them (or their awards) under the board they left; here they are
// moved: their player entry, with the awards recorded on it, goes to the new board and disappears from the old one. This is applied on
// every sync, so it keeps holding until the line is removed (remove it if the player ever returns). Board names as in the sheet's tabs.
// `into` names the entry on the new board when it is spelt differently.
export const TRANSFERS = [
  { name: 'Bhavin Kumar', from: 'Pakistan', to: 'South Africa' },
  // Adithya Mahajan ("Aditya" in the scorer exports) played for these boards and is on South Africa's roster (he went to the USA and came back)
  { name: 'Adithya Mahajan', from: 'Bangladesh', to: 'South Africa', into: 'Aditya Mahajan' },
  { name: 'Adithya Mahajan', from: 'Qatar', to: 'South Africa', into: 'Aditya Mahajan' },
  { name: 'Adithya Mahajan', from: 'USA', to: 'South Africa', into: 'Aditya Mahajan' },
  { name: 'Siddharth V Jain', from: 'South Africa', to: 'Bangladesh' },
  // Karthik Verma ("Karthik Varma" in the scorer exports) played for England and joined Ireland (England's tab marks him "Removed")
  { name: 'Karthik Verma', from: 'England', to: 'Ireland' },
  { name: 'Karthik Varma', from: 'England', to: 'Ireland', into: 'Karthik Verma' },
  // Shib Asis ("Shibasis" on South Africa's list) moved from New Zealand to South Africa ("Shibasis to SA: 5000")
  { name: 'Shib Asis', from: 'New Zealand', to: 'South Africa', into: 'Shibasis' },
  { name: 'Sai Naveen', from: 'Australia', to: 'Bangladesh' },
  { name: 'Aniket Gavit', from: 'England', to: 'New Zealand' },
  { name: 'Mudasir Ali', from: 'Qatar', to: 'Pakistan' },
  { name: 'Mudasir Ali', from: 'Pakistan', to: 'Spain', into: 'Mudasir Zaffar' }, // the same person: now on Spain's list as Mudasir Zaffar
  { name: 'Mudasir Ali', from: 'Spain', to: 'Spain', into: 'Mudasir Zaffar' }, // (his umpire entry on Spain's sheet is under the old name)
  { name: 'Harsh Dubey', from: 'Bangladesh', to: 'USA' },
  { name: 'Harsh Dubey', from: 'Australia', to: 'USA' },
  { name: 'Muhammad Touqeer', from: 'Qatar', to: 'Spain' },
  // Marami ("Marami Ahmed" in the scorer exports and in the Netherlands tabs' awards) is now on the USA roster
  // Mexico's new board: Ali Khan (chairman) came from Bangladesh, Ashfaq Hosain (CEO) from the USA
  { name: 'Ali Khan', from: 'Bangladesh', to: 'Mexico' },
  { name: 'Ashfaq Hosain', from: 'USA', to: 'Mexico' },
  // Siddharth V Jain ("Sidd V Jain" on some lists) played for Bangladesh, South Africa and Australia; he is now one player on Mexico
  ...['Bangladesh', 'South Africa', 'Australia'].flatMap((from) => [
    { name: 'Siddharth V Jain', from, to: 'Mexico' },
    { name: 'Sidd V Jain', from, to: 'Mexico', into: 'Siddharth V Jain' },
  ]),
  // Akshay played for Italy and is now on Japan's roster (his Japan entry is the one kept)
  { name: 'Akshay', from: 'Italy', to: 'Japan' },
  // moves the sheet records in the trade notes ("Hizbullah to Spain: Free", "Naveen to PNG", "Sujith to Portugal", "Kaushik to BD", "Suleman to USA", "Huzaifa to USA")
  { name: 'Hizbullah Sahito', from: 'Pakistan', to: 'Spain' },
  { name: 'Naveen Gupta', from: 'Canada', to: 'Papua New Guinea' },
  { name: 'Naveen Gupta', from: 'New Zealand', to: 'Papua New Guinea' },
  { name: 'Sujith Kumar', from: 'England', to: 'Portugal' },
  { name: 'Kaushik Kalita', from: 'South Africa', to: 'Bangladesh' },
  { name: 'Suleman Haider', from: 'Qatar', to: 'USA' },
  { name: 'Huzaifa Imran', from: 'Qatar', to: 'USA' },
  // moves confirmed by the administrator
  { name: 'Christy Royson', from: 'Nepal', to: 'Afghanistan' },
  { name: 'Kashif Ramzan', from: 'Nepal', to: 'Afghanistan' },
  { name: 'Farhan Mallick', from: 'Qatar', to: 'Afghanistan' },
  { name: 'Malik Zubair', from: 'Qatar', to: 'Australia' },
  { name: 'Toby Joseph', from: 'England', to: 'New Zealand', into: 'Toby Jospeh' }, // (the sheet spells him "Jospeh" on New Zealand's list)
  { name: 'Saubhagya Gupta', from: 'Australia', to: 'South Africa' },
  { name: 'Anand Kumar', from: 'Australia', to: 'Mexico' },
  // (the two Abhijiths, on England and on the UAE, are two different people)
  { name: 'Marami', from: 'Netherlands', to: 'USA' },
  { name: 'Marami Ahmed', from: 'Netherlands', to: 'USA', into: 'Marami' },
  { name: 'Anas Asim', from: 'Qatar', to: 'Spain' }, // already on Spain's list; his Qatar entry is an earlier board
  // Waqas Mughal went Bangladesh → Nepal and came back ("Waqas to Bangladesh" in Nepal's trades): he is on Bangladesh's roster now
  { name: 'Waqas Mughal', from: 'Nepal', to: 'Bangladesh' },
  { name: 'Waqas Mughal', from: 'Australia', to: 'Bangladesh' }, // his Australia entry is an earlier board
  { name: 'Rima Naskar Sona', from: 'Pakistan', to: 'Australia' },
  { name: 'Rima Roy', from: 'Pakistan', to: 'Australia', into: 'Rima Naskar Sona' },
];

// The same person listed twice on one board under different spellings: the entries are merged into `keep` (with their awards).
export const MERGES = [
  { board: "Mexico", keep: "Siddharth V Jain", drop: ["Sidd V Jain"] },
  { board: "Australia", keep: "Anand Ajikumar", drop: ["Anandan Ajikumar"] },
  { board: "Australia", keep: "Muhammad Noor", drop: ["Mohammaed Noor"] },
  { board: "Bangladesh", keep: "Tanusri Dutta", drop: ["Tansuri Dutta"] },
  { board: "Bangladesh", keep: "Princhi Bora", drop: ["Princhi Pratim Bora", "Princhi", "Ppb"] },
  { board: "South Africa", keep: "Aditya Mahajan", drop: ["Adithya Mahajan"] },
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
