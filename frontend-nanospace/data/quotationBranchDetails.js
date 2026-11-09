const branchDetails = [
  {
    match: 'jubilee',
    numberPrefix: 'JUBILEE-HILLS',
    headerName: 'Nano Space Co-Working - Jubilee Hills',
    name: 'Nano Space Co-Working - Jubilee Hills',
    address: '3rd Floor, SUJANA ONE, 210, Road No. 82, Film Nagar, Jubilee Hills, Hyderabad, Telangana - 500096.',
    phone: '+91 91212 96499',
  },
  {
    match: 'kphb',
    numberPrefix: 'KPHB',
    headerName: 'NanoSpace - KPHB',
    name: 'NanoSpace - KPHB',
    address: 'Plot No. 140 & 141, KPHB 6th Phase Road, Kukatpally Housing Board Colony, Hyderabad, Telangana - 500085.',
    phone: '+91 98491 35358',
  },
  {
    match: 'nanakramguda',
    numberPrefix: 'NANAKRAMGUDA',
    headerName: 'Vijaya Krishna Alliance Nanospace',
    isHeadOffice: true,
    name: 'NanoSpace - Nanakramguda',
    address: 'Vijaya Krishna Towers, Survey 27/4, Floor 9, Gachibowli, Nanakramguda Village, Financial District, Hyderabad, Telangana - 500032.',
    phone: '9966585958',
    email: 'admin@nanospaceindia.com',
  },
  {
    match: 'kokapet',
    numberPrefix: 'KOKAPET',
    headerName: 'NanoSpace - Kokapet',
    name: 'NanoSpace - Kokapet',
    address: 'Kokapet',
  },
];

export function getQuotationBranchDetails(branch) {
  const branchName = typeof branch === 'object' && branch
    ? branch.name || branch.branch_name || ''
    : String(branch || '');
  const normalizedName = branchName.toLowerCase();
  const details = branchDetails.find(({ match }) => normalizedName.includes(match));

  if (details) return { ...details };

  return {
    name: branchName || 'NanoSpace Co-Working',
    headerName: branchName || 'NanoSpace Co-Working',
    address: 'Hyderabad, Telangana',
  };
}

export function getQuotationNumberPrefix(branch) {
  const branchName = typeof branch === 'object' && branch
    ? branch.name || branch.branch_name || ''
    : String(branch || '');
  const normalizedName = branchName.toLowerCase();
  const details = branchDetails.find(({ match }) => normalizedName.includes(match));

  if (details) return details.numberPrefix;

  const prefix = branchName
    .replace(/^nanospace\s*-\s*/i, '')
    .replace(/^nano\s*space\s*co-working\s*-\s*/i, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return prefix || 'NANOSPACE';
}
