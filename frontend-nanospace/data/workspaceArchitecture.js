// Default Architecture configuration for NanoSpace branches
// Supports Private Cabins (5, 10, 20 seats), Conference Rooms (10-seater), Podcast Rooms & Desks

export const SPACE_TYPES = {
  private_cabin: {
    id: 'private_cabin',
    label: 'Private Cabin',
    shortLabel: 'Cabin',
    badgeTone: 'indigo',
    iconName: 'FiShield',
    defaultCapacity: 10,
    capacityPresets: [3, 5, 10, 15, 20, 25],
    defaultRate: 95000,
    rateUnit: 'month',
    description: 'Fully furnished private office with locking doors, sound insulation & dedicated network.',
    defaultAmenities: [
      'Soundproof Glass',
      'Private RFID Keycard',
      'Ergonomic Chairs',
      'High-Speed 1Gbps Fiber LAN',
      'Magnetic Whiteboard'
    ]
  },
  conference_room: {
    id: 'conference_room',
    label: 'Conference Room',
    shortLabel: 'Conference',
    badgeTone: 'cyan',
    iconName: 'FiMonitor',
    defaultCapacity: 10,
    capacityPresets: [6, 8, 10, 12, 16, 20],
    defaultRate: 4999,
    rateUnit: 'session',
    description: 'High-tech boardroom with 4K presentation display, PTZ video conferencing & acoustic dampening.',
    defaultAmenities: [
      '4K Conference Display',
      'PTZ 4K Video Cam',
      'Soundproof Glass',
      'Digital Whiteboard',
      'Acoustic Ceiling Panels'
    ]
  },
  podcast_room: {
    id: 'podcast_room',
    label: 'Podcast Studio',
    shortLabel: 'Podcast',
    badgeTone: 'magenta',
    iconName: 'FiMic',
    defaultCapacity: 4,
    capacityPresets: [2, 3, 4, 6],
    defaultRate: 999,
    rateUnit: 'session',
    description: 'Acoustic-treated studio with Shure broadcast mics, sound interface & streaming video setup.',
    defaultAmenities: [
      'Shure SM7B Broadcast Mics',
      'Rodecaster Pro II Console',
      'Acoustic Wall Panels',
      '4K Streaming Camera',
      'On-Air Indicator Light',
      'Headphone Monitoring'
    ]
  },
  dedicated_desk: {
    id: 'dedicated_desk',
    label: 'Dedicated Desk Bay',
    shortLabel: 'Dedicated',
    badgeTone: 'emerald',
    iconName: 'FiGrid',
    defaultCapacity: 6,
    capacityPresets: [4, 6, 8, 12],
    defaultRate: 9500,
    rateUnit: 'month',
    description: 'Reserved personal desks in a quiet team pod with lockable pedestals.',
    defaultAmenities: [
      'High-Speed 1Gbps Fiber LAN',
      'Lockable Storage Pedestal',
      'Ergonomic Mesh Chairs',
      'Power Hub with Surge Protection'
    ]
  },
  hot_desk: {
    id: 'hot_desk',
    label: 'Hot Desk Zone',
    shortLabel: 'Hot Desk',
    badgeTone: 'amber',
    iconName: 'FiLayers',
    defaultCapacity: 12,
    capacityPresets: [8, 12, 16, 24],
    defaultRate: 8500,
    rateUnit: 'month',
    description: 'Flexible agile seating in vibrant open-plan zones.',
    defaultAmenities: [
      'High-Speed WiFi 6',
      'Power Outlets & USB-C',
      'Ergonomic Chairs',
      'Pantry & Coffee Access'
    ]
  },
  executive_suite: {
    id: 'executive_suite',
    label: 'Executive Suite',
    shortLabel: 'Executive',
    badgeTone: 'purple',
    iconName: 'FiHome',
    defaultCapacity: 8,
    capacityPresets: [4, 6, 8, 12],
    defaultRate: 125000,
    rateUnit: 'month',
    description: 'Premium corner office with private lounge area, mini-bar & panoramic city view.',
    defaultAmenities: [
      'Soundproof Glass',
      'Private RFID Keycard',
      'Lounge Seating',
      '4K Presentation Display',
      'Dedicated Climate Control'
    ]
  }
};

export const AVAILABLE_AMENITIES = [
  'Soundproof Glass',
  '4K Conference Display',
  'Shure SM7B Broadcast Mics',
  'Rodecaster Pro II Console',
  'PTZ 4K Video Cam',
  'Private RFID Keycard',
  'Magnetic Whiteboard',
  'Digital Interactive Display',
  'High-Speed 1Gbps Fiber LAN',
  'Acoustic Wall Panels',
  'Ergonomic Chairs',
  'Executive Desk',
  'On-Air Indicator Light',
  'Headphone Monitoring',
  'Dedicated Climate Control',
  'Lounge Seating',
  'Nespresso Coffee Bar Access',
  'Power Hub with Surge Protection'
];

export const DEFAULT_BRANCH_ARCHITECTURE = {
  Nanakramguda: [
    // 4 x 10-seater private cabins
    {
      id: 'arch-nng-cab10-01',
      code: 'NNG1-private cabin 10 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG1-private cabin 10 seater',
      capacity: 10,
      status: 'Occupied',
      assignedCustomer: { id: 'CUS-1002', name: 'Mira Tech Pvt Ltd', company: 'Mira Tech Pvt Ltd' },
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard', 'High-Speed 1Gbps Fiber LAN'],
      notes: '10-seater executive private cabin'
    },
    {
      id: 'arch-nng-cab10-02',
      code: 'NNG2-private cabin 10 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG2-private cabin 10 seater',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
      notes: '10-seater engineering team cabin'
    },
    {
      id: 'arch-nng-cab10-03',
      code: 'NNG3-private cabin 10 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG3-private cabin 10 seater',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Magnetic Whiteboard', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
      notes: '10-seater product cabin'
    },
    {
      id: 'arch-nng-cab10-04',
      code: 'NNG4-private cabin 10 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG4-private cabin 10 seater',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
      notes: '10-seater operations cabin'
    },

    // 3 x 20-seater private cabins
    {
      id: 'arch-nng-cab20-01',
      code: 'NNG1-private cabin 20 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG1-private cabin 20 seater',
      capacity: 20,
      status: 'Occupied',
      assignedCustomer: { id: 'CUS-1004', name: 'Nexa Labs', company: 'Nexa Labs' },
      rate: 218500,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard', 'High-Speed 1Gbps Fiber LAN'],
      notes: '20-seat enterprise cabin with internal meeting nook'
    },
    {
      id: 'arch-nng-cab20-02',
      code: 'NNG2-private cabin 20 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG2-private cabin 20 seater',
      capacity: 20,
      status: 'Available',
      assignedCustomer: null,
      rate: 218500,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
      notes: '20-seat corporate office suite'
    },
    {
      id: 'arch-nng-cab20-03',
      code: 'NNG3-private cabin 20 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'NNG3-private cabin 20 seater',
      capacity: 20,
      status: 'Available',
      assignedCustomer: null,
      rate: 218500,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
      notes: '20-seat scaleup team suite'
    },

    // 4 x 6-seater hot desks
    {
      id: 'arch-nng-desk6-01',
      code: 'NNG1-hot desk 6 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'hot_desk',
      name: 'NNG1-hot desk 6 seater',
      capacity: 6,
      status: 'Available',
      assignedCustomer: null,
      rate: 8500,
      rateUnit: 'month',
      amenities: ['High-Speed WiFi 6', 'Power Outlets & USB-C', 'Ergonomic Chairs'],
      notes: '6 hot desks agile pod'
    },
    {
      id: 'arch-nng-desk6-02',
      code: 'NNG2-hot desk 6 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'hot_desk',
      name: 'NNG2-hot desk 6 seater',
      capacity: 6,
      status: 'Occupied',
      assignedCustomer: { id: 'CUS-1005', name: 'DevSquad Team', company: 'DevSquad' },
      rate: 8500,
      rateUnit: 'month',
      amenities: ['High-Speed WiFi 6', 'Power Outlets & USB-C', 'Ergonomic Chairs'],
      notes: '6 hot desks agile pod - assigned to DevSquad'
    },
    {
      id: 'arch-nng-desk6-03',
      code: 'NNG3-hot desk 6 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'hot_desk',
      name: 'NNG3-hot desk 6 seater',
      capacity: 6,
      status: 'Available',
      assignedCustomer: null,
      rate: 8500,
      rateUnit: 'month',
      amenities: ['High-Speed WiFi 6', 'Power Outlets & USB-C', 'Ergonomic Chairs'],
      notes: '6 hot desks agile pod'
    },
    {
      id: 'arch-nng-desk6-04',
      code: 'NNG4-hot desk 6 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'hot_desk',
      name: 'NNG4-hot desk 6 seater',
      capacity: 6,
      status: 'Available',
      assignedCustomer: null,
      rate: 8500,
      rateUnit: 'month',
      amenities: ['High-Speed WiFi 6', 'Power Outlets & USB-C', 'Ergonomic Chairs'],
      notes: '6 hot desks agile pod'
    },

    // 1 x Conference room & 1 x Podcast room
    {
      id: 'arch-nng-conf-01',
      code: 'NNG1-conference room 10 seater',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'conference_room',
      name: 'NNG1-conference room 10 seater',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 4999,
      rateUnit: 'session',
      amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Digital Whiteboard', 'Soundproof Glass', 'Acoustic Ceiling Panels'],
      notes: 'High-end boardroom for video conferencing & client presentations'
    },
    {
      id: 'arch-nng-pod-01',
      code: 'NNG1-podcast room',
      branch: 'Nanakramguda',
      floor: 'Ground Floor',
      type: 'podcast_room',
      name: 'NNG1-podcast room',
      capacity: 4,
      status: 'Available',
      assignedCustomer: null,
      rate: 999,
      rateUnit: 'session',
      amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels', '4K Streaming Camera', 'On-Air Indicator Light'],
      notes: 'Broadcast-grade acoustic podcast recording booth'
    }
  ],
  KPHB: [
    {
      id: 'arch-kphb-cab-01',
      branch: 'KPHB',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Titan (20 Seater)',
      capacity: 20,
      status: 'Available',
      assignedCustomer: null,
      rate: 218500,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard'],
      notes: 'Scale team cabin'
    },
    {
      id: 'arch-kphb-cab-02',
      branch: 'KPHB',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Orbit (10 Seater)',
      capacity: 10,
      status: 'Occupied',
      assignedCustomer: { id: 'CUS-1002', name: 'Mira Tech Pvt Ltd', company: 'Mira Tech Pvt Ltd' },
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: 'Mid-sized team cabin'
    },
    {
      id: 'arch-kphb-cab-03',
      branch: 'KPHB',
      floor: '1st Floor',
      type: 'private_cabin',
      name: 'Private Cabin Spark (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: 'Mid-sized team cabin'
    },
    {
      id: 'arch-kphb-cab-04',
      branch: 'KPHB',
      floor: '1st Floor',
      type: 'private_cabin',
      name: 'Private Cabin Nova (5 Seater)',
      capacity: 5,
      status: 'Available',
      assignedCustomer: null,
      rate: 48000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk'],
      notes: 'Small team cabin'
    },
    {
      id: 'arch-kphb-conf-01',
      branch: 'KPHB',
      floor: 'Ground Floor',
      type: 'conference_room',
      name: 'Summit Conference Room (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 4999,
      rateUnit: 'session',
      amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Soundproof Glass', 'Acoustic Ceiling Panels'],
      notes: 'Main 10-seater conference hall'
    },
    {
      id: 'arch-kphb-pod-01',
      branch: 'KPHB',
      floor: 'Ground Floor',
      type: 'podcast_room',
      name: 'Media Lab Podcast Studio',
      capacity: 4,
      status: 'Available',
      assignedCustomer: null,
      rate: 999,
      rateUnit: 'session',
      amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels', '4K Streaming Camera'],
      notes: 'Fully acoustic podcast suite'
    }
  ],
  'Jubilee Hills': [
    {
      id: 'arch-jub-cab-01',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Executive Cabin Crown (20 Seater)',
      capacity: 20,
      status: 'Available',
      assignedCustomer: null,
      rate: 225000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard', 'Lounge Seating'],
      notes: 'Luxury executive private cabin'
    },
    {
      id: 'arch-jub-cab-02',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Horizon (10 Seater)',
      capacity: 10,
      status: 'Occupied',
      assignedCustomer: { id: 'CUS-1003', name: 'Aarav Consulting', company: 'Aarav Consulting' },
      rate: 98000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard'],
      notes: '10 seater private cabin'
    },
    {
      id: 'arch-jub-cab-03',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Sol (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 98000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: '10 seater private cabin'
    },
    {
      id: 'arch-jub-cab-04',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Zenith (5 Seater)',
      capacity: 5,
      status: 'Available',
      assignedCustomer: null,
      rate: 52000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk'],
      notes: '5 seater private cabin'
    },
    {
      id: 'arch-jub-conf-01',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'conference_room',
      name: 'Boardroom Prime (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 5999,
      rateUnit: 'session',
      amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Soundproof Glass', 'Digital Whiteboard'],
      notes: 'Flagship boardroom'
    },
    {
      id: 'arch-jub-pod-01',
      branch: 'Jubilee Hills',
      floor: 'Ground Floor',
      type: 'podcast_room',
      name: 'Studio Apex Podcast Room',
      capacity: 4,
      status: 'Available',
      assignedCustomer: null,
      rate: 1200,
      rateUnit: 'session',
      amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels', '4K Streaming Camera'],
      notes: 'Premium broadcast studio'
    }
  ],
  Kokapet: [
    {
      id: 'arch-kok-cab-01',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Silicon (20 Seater)',
      capacity: 20,
      status: 'Available',
      assignedCustomer: null,
      rate: 210000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: '20 seat tech team pod'
    },
    {
      id: 'arch-kok-cab-02',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Quantum (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 92000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: '10 seater team cabin'
    },
    {
      id: 'arch-kok-cab-03',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Helix (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 92000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: '10 seater team cabin'
    },
    {
      id: 'arch-kok-cab-04',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'private_cabin',
      name: 'Private Cabin Vertex (5 Seater)',
      capacity: 5,
      status: 'Available',
      assignedCustomer: null,
      rate: 46000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk'],
      notes: '5 seater executive pod'
    },
    {
      id: 'arch-kok-conf-01',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'conference_room',
      name: 'Matrix Conference Hall (10 Seater)',
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 4999,
      rateUnit: 'session',
      amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Soundproof Glass', 'Digital Whiteboard'],
      notes: '10 seater smart conference room'
    },
    {
      id: 'arch-kok-pod-01',
      branch: 'Kokapet',
      floor: 'Ground Floor',
      type: 'podcast_room',
      name: 'Broadcast Pod Kokapet',
      capacity: 4,
      status: 'Available',
      assignedCustomer: null,
      rate: 999,
      rateUnit: 'session',
      amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels', '4K Streaming Camera'],
      notes: 'Podcast recording studio'
    }
  ]
};

const STORAGE_KEY = 'nanospace_workspace_architecture_v2';

export function generateNextSpaceName(branchName, type, capacity = 10, currentSpaces = []) {
  const cap = Number(capacity) || 10;
  if (branchName === 'Nanakramguda' || branchName === 'NANAKRAMGUDA') {
    if (type === 'private_cabin') {
      const matchingCabins = currentSpaces.filter(s => s.type === 'private_cabin' && Number(s.capacity) === cap);
      const nextNum = matchingCabins.length + 1;
      return `NNG${nextNum}-private cabin ${cap} seater`;
    }
    if (type === 'hot_desk' || type === 'dedicated_desk') {
      const matchingDesks = currentSpaces.filter(s => (s.type === 'hot_desk' || s.type === 'dedicated_desk') && Number(s.capacity) === cap);
      const nextNum = matchingDesks.length + 1;
      return `NNG${nextNum}-hot desk ${cap} seater`;
    }
    if (type === 'conference_room') {
      const matchingConf = currentSpaces.filter(s => s.type === 'conference_room');
      const nextNum = matchingConf.length + 1;
      return `NNG${nextNum}-conference room ${cap} seater`;
    }
    if (type === 'podcast_room') {
      const matchingPod = currentSpaces.filter(s => s.type === 'podcast_room');
      const nextNum = matchingPod.length + 1;
      return `NNG${nextNum}-podcast room`;
    }
    const nextNum = currentSpaces.length + 1;
    return `NNG${nextNum}-workspace ${cap} seater`;
  }

  const typeDef = SPACE_TYPES[type] || SPACE_TYPES.private_cabin;
  const count = currentSpaces.filter(s => s.type === type).length + 1;
  return `${typeDef.label} ${count} (${cap} Seater)`;
}

export function loadAllBranchArchitecture() {
  if (typeof window === 'undefined') return DEFAULT_BRANCH_ARCHITECTURE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BRANCH_ARCHITECTURE));
      return DEFAULT_BRANCH_ARCHITECTURE;
    }
    const parsed = JSON.parse(raw);
    const hasNngScheme = Array.isArray(parsed?.Nanakramguda) && parsed.Nanakramguda.some(s => s.name?.includes('NNG1-private cabin 10 seater') || s.code?.includes('NNG1-private cabin 10 seater'));
    if (!hasNngScheme) {
      parsed.Nanakramguda = DEFAULT_BRANCH_ARCHITECTURE.Nanakramguda;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return { ...DEFAULT_BRANCH_ARCHITECTURE, ...parsed };
  } catch (error) {
    console.warn('Failed to load branch architecture from localStorage:', error);
    return DEFAULT_BRANCH_ARCHITECTURE;
  }
}

export function saveAllBranchArchitecture(allData) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch (error) {
    console.error('Failed to save branch architecture to localStorage:', error);
  }
}

export function createArchitecturePreset(branchName, presetType = 'standard_enterprise', floorName = 'Ground Floor') {
  const timestamp = Date.now().toString().slice(-4);
  if (presetType === 'standard_enterprise') {
    // 4 Private Cabins (20 seats, 10 seats, 10 seats, 5 seats) + 1 Conference (10s) + 1 Podcast Room
    return [
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-20-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'private_cabin',
        name: `Private Cabin Alpha (${branchName})`,
        capacity: 20,
        status: 'Available',
        assignedCustomer: null,
        rate: 218500,
        rateUnit: 'month',
        amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'Magnetic Whiteboard', 'High-Speed 1Gbps Fiber LAN'],
        notes: '20-seat executive team cabin with manager enclosure'
      },
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-10a-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'private_cabin',
        name: `Private Cabin Beta (${branchName})`,
        capacity: 10,
        status: 'Available',
        assignedCustomer: null,
        rate: 95000,
        rateUnit: 'month',
        amenities: ['Soundproof Glass', '4K Conference Display', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
        notes: '10-seat developer wing'
      },
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-10b-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'private_cabin',
        name: `Private Cabin Gamma (${branchName})`,
        capacity: 10,
        status: 'Available',
        assignedCustomer: null,
        rate: 95000,
        rateUnit: 'month',
        amenities: ['Soundproof Glass', 'Magnetic Whiteboard', 'Private RFID Keycard', 'Ergonomic Chairs', 'High-Speed 1Gbps Fiber LAN'],
        notes: '10-seat product room'
      },
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-5-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'private_cabin',
        name: `Private Cabin Delta (${branchName})`,
        capacity: 5,
        status: 'Available',
        assignedCustomer: null,
        rate: 48000,
        rateUnit: 'month',
        amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk', 'Ergonomic Chairs'],
        notes: '5-seat founder & manager pod'
      },
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-conf-10-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'conference_room',
        name: `Conference Hall Nexus (10 Seater)`,
        capacity: 10,
        status: 'Available',
        assignedCustomer: null,
        rate: 4999,
        rateUnit: 'session',
        amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Digital Whiteboard', 'Soundproof Glass', 'Acoustic Ceiling Panels'],
        notes: '10-seater boardroom with video conferencing'
      },
      {
        id: `arch-${branchName.toLowerCase().slice(0, 4)}-pod-4-${timestamp}`,
        branch: branchName,
        floor: floorName,
        type: 'podcast_room',
        name: `Studio Pulse Podcast Room`,
        capacity: 4,
        status: 'Available',
        assignedCustomer: null,
        rate: 999,
        rateUnit: 'session',
        amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels', '4K Streaming Camera', 'On-Air Indicator Light'],
        notes: 'Acoustic broadcast podcast room'
      }
    ];
  }

  // Creative media & startup floor
  return [
    {
      id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-10-${timestamp}`,
      branch: branchName,
      floor: floorName,
      type: 'private_cabin',
      name: `Private Cabin Sprint (10 Seater)`,
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 95000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
      notes: '10-seat agile cabin'
    },
    {
      id: `arch-${branchName.toLowerCase().slice(0, 4)}-cab-5-${timestamp}`,
      branch: branchName,
      floor: floorName,
      type: 'private_cabin',
      name: `Private Cabin Core (5 Seater)`,
      capacity: 5,
      status: 'Available',
      assignedCustomer: null,
      rate: 48000,
      rateUnit: 'month',
      amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Executive Desk'],
      notes: '5-seat cabin'
    },
    {
      id: `arch-${branchName.toLowerCase().slice(0, 4)}-conf-10-${timestamp}`,
      branch: branchName,
      floor: floorName,
      type: 'conference_room',
      name: `Conference Hall Focus (10 Seater)`,
      capacity: 10,
      status: 'Available',
      assignedCustomer: null,
      rate: 4999,
      rateUnit: 'session',
      amenities: ['4K Conference Display', 'PTZ 4K Video Cam', 'Soundproof Glass'],
      notes: '10-seater conference room'
    },
    {
      id: `arch-${branchName.toLowerCase().slice(0, 4)}-pod-4-${timestamp}`,
      branch: branchName,
      floor: floorName,
      type: 'podcast_room',
      name: `Audio Lab Podcast Booth`,
      capacity: 4,
      status: 'Available',
      assignedCustomer: null,
      rate: 999,
      rateUnit: 'session',
      amenities: ['Shure SM7B Broadcast Mics', 'Rodecaster Pro II Console', 'Acoustic Wall Panels'],
      notes: 'Podcast recording booth'
    },
    {
      id: `arch-${branchName.toLowerCase().slice(0, 4)}-desk-12-${timestamp}`,
      branch: branchName,
      floor: floorName,
      type: 'hot_desk',
      name: `Open Flex Coworking Pod`,
      capacity: 12,
      status: 'Available',
      assignedCustomer: null,
      rate: 8500,
      rateUnit: 'month',
      amenities: ['High-Speed WiFi 6', 'Power Outlets & USB-C', 'Ergonomic Chairs'],
      notes: '12 hot desks'
    }
  ];
}
