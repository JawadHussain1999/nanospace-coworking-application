import { useState, useMemo, useEffect } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row
} from 'reactstrap';
import {
  FiMapPin,
  FiLayers,
  FiUsers,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiCheck,
  FiCheckCircle,
  FiShield,
  FiMonitor,
  FiMic,
  FiGrid,
  FiHome,
  FiZap,
  FiSearch,
  FiSliders,
  FiUserCheck,
  FiTag,
  FiArrowRight,
  FiRefreshCw,
  FiInfo
} from 'react-icons/fi';
import WorkspaceRoomBlueprint from './WorkspaceRoomBlueprint';
import StatMetricCard from '../shared/StatMetricCard';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import {
  SPACE_TYPES,
  AVAILABLE_AMENITIES,
  DEFAULT_BRANCH_ARCHITECTURE,
  loadAllBranchArchitecture,
  saveAllBranchArchitecture,
  createArchitecturePreset
} from '../../data/workspaceArchitecture';
import { api, isApiEnabled, getApiErrorMessage } from '../../services/api';
import { showSuccess, showError } from '../../utils/toast';

export default function WorkspaceArchitectureBuilder({
  user,
  branches = ['Nanakramguda', 'KPHB', 'Jubilee Hills', 'Kokapet'],
  selectedBranch: initialBranch = 'Nanakramguda',
  onSelectBranch = null,
  customers = [],
  apiWorkspaces = [],
  onRefreshApi = null
}) {
  const [currentBranch, setCurrentBranch] = useState(initialBranch);
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [allArchitecture, setAllArchitecture] = useState(DEFAULT_BRANCH_ARCHITECTURE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [notice, setNotice] = useState({ text: '', type: 'info' });
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

  // Modal States
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningSpace, setAssigningSpace] = useState(null);
  const [assignedCustomerId, setAssignedCustomerId] = useState('');
  const [apiBusy, setApiBusy] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState(null);

  // Form State for Add / Edit Space
  const [formData, setFormData] = useState({
    branch: currentBranch,
    floor: 'Ground Floor',
    type: 'private_cabin',
    name: '',
    capacity: 10,
    rate: 95000,
    rateUnit: 'month',
    status: 'Available',
    amenities: ['Soundproof Glass', 'Private RFID Keycard', 'Ergonomic Chairs'],
    notes: ''
  });

  // Sync initial branch changes from parent
  useEffect(() => {
    if (initialBranch && initialBranch !== currentBranch) {
      setCurrentBranch(initialBranch);
    }
  }, [initialBranch]);

  // Load saved architecture on mount
  useEffect(() => {
    const loaded = loadAllBranchArchitecture();
    setAllArchitecture(loaded);
    setIsLoaded(true);
  }, []);

  // Update storage whenever architecture changes
  const updateArchitecture = (newArchMap) => {
    setAllArchitecture(newArchMap);
    saveAllBranchArchitecture(newArchMap);
  };

  // Current branch spaces
  const branchSpaces = useMemo(() => {
    return allArchitecture[currentBranch] || [];
  }, [allArchitecture, currentBranch]);

  // Available floors for current branch
  const availableFloors = useMemo(() => {
    const floors = new Set(branchSpaces.map((s) => s.floor).filter(Boolean));
    floors.add('Ground Floor');
    floors.add('1st Floor');
    floors.add('2nd Floor');
    return Array.from(floors);
  }, [branchSpaces]);

  // Filtered spaces based on floor, category, and search
  const filteredSpaces = useMemo(() => {
    return branchSpaces.filter((space) => {
      if (selectedFloor !== 'All' && space.floor !== selectedFloor) return false;
      if (categoryFilter !== 'all' && space.type !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = space.name?.toLowerCase().includes(query);
        const matchNotes = space.notes?.toLowerCase().includes(query);
        const matchCustomer = space.assignedCustomer?.name?.toLowerCase().includes(query);
        if (!matchName && !matchNotes && !matchCustomer) return false;
      }
      return true;
    });
  }, [branchSpaces, selectedFloor, categoryFilter, searchQuery]);

  // Architectural Statistics
  const stats = useMemo(() => {
    const totalSpaces = branchSpaces.length;
    const totalCapacity = branchSpaces.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const cabins = branchSpaces.filter((s) => s.type === 'private_cabin');
    const cabinCapacity = cabins.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const confRooms = branchSpaces.filter((s) => s.type === 'conference_room');
    const confCapacity = confRooms.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const podcasts = branchSpaces.filter((s) => s.type === 'podcast_room');
    const podcastCapacity = podcasts.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const occupied = branchSpaces.filter((s) => s.status === 'Occupied');
    const occupiedSeats = occupied.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const occupancyRate = totalCapacity > 0 ? Math.round((occupiedSeats / totalCapacity) * 100) : 0;

    return {
      totalSpaces,
      totalCapacity,
      cabinsCount: cabins.length,
      cabinCapacity,
      confCount: confRooms.length,
      confCapacity,
      podcastsCount: podcasts.length,
      podcastCapacity,
      occupancyRate
    };
  }, [branchSpaces]);

  // Handle branch switch
  const handleBranchChange = (branchName) => {
    setCurrentBranch(branchName);
    setSelectedFloor('All');
    if (onSelectBranch) onSelectBranch(branchName);
  };

  // Open Add Space Modal
  const openAddModal = (presetType = 'private_cabin') => {
    const typeDef = SPACE_TYPES[presetType] || SPACE_TYPES.private_cabin;
    const countOfType = branchSpaces.filter((s) => s.type === presetType).length;
    const generatedName = `${typeDef.label} ${String.fromCharCode(65 + countOfType)} (${typeDef.defaultCapacity} Seater)`;

    setEditingSpaceId(null);
    setFormData({
      branch: currentBranch,
      floor: selectedFloor === 'All' ? 'Ground Floor' : selectedFloor,
      type: presetType,
      name: generatedName,
      capacity: typeDef.defaultCapacity,
      rate: typeDef.defaultRate,
      rateUnit: typeDef.rateUnit,
      status: 'Available',
      amenities: [...typeDef.defaultAmenities],
      notes: ''
    });
    setSpaceModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (space) => {
    setEditingSpaceId(space.id);
    setFormData({
      branch: space.branch,
      floor: space.floor || 'Ground Floor',
      type: space.type || 'private_cabin',
      name: space.name,
      capacity: space.capacity || 10,
      rate: space.rate || 95000,
      rateUnit: space.rateUnit || 'month',
      status: space.status || 'Available',
      amenities: Array.isArray(space.amenities) ? [...space.amenities] : [],
      notes: space.notes || ''
    });
    setSpaceModalOpen(true);
  };

  // Handle Space Type change inside modal
  const handleTypeChangeInModal = (newType) => {
    const typeDef = SPACE_TYPES[newType] || SPACE_TYPES.private_cabin;
    const countOfType = branchSpaces.filter((s) => s.type === newType).length;
    const generatedName = `${typeDef.label} ${String.fromCharCode(65 + countOfType)} (${typeDef.defaultCapacity} Seater)`;

    setFormData((prev) => ({
      ...prev,
      type: newType,
      name: prev.name.includes(SPACE_TYPES[prev.type]?.label || '') ? generatedName : prev.name,
      capacity: typeDef.defaultCapacity,
      rate: typeDef.defaultRate,
      rateUnit: typeDef.rateUnit,
      amenities: [...typeDef.defaultAmenities]
    }));
  };

  // Sync capacity and dynamically update name tag (e.g. 10 Seater -> 20 Seater)
  const updateCapacity = (newCap) => {
    const capNum = Math.max(1, Number(newCap) || 1);
    setFormData((prev) => {
      let updatedName = prev.name;
      if (/\(\d+\s*seats?\)/i.test(updatedName)) {
        updatedName = updatedName.replace(/\(\d+\s*seats?\)/i, `(${capNum} Seats)`);
      } else if (/\(\d+\s*seater\)/i.test(updatedName)) {
        updatedName = updatedName.replace(/\(\d+\s*seater\)/i, `(${capNum} Seater)`);
      }
      return {
        ...prev,
        capacity: capNum,
        name: updatedName
      };
    });
  };

  // Listen to open-arch-space-modal global trigger
  useEffect(() => {
    const handler = () => openAddModal('private_cabin');
    window.addEventListener('open-arch-space-modal', handler);
    return () => window.removeEventListener('open-arch-space-modal', handler);
  }, [branchSpaces]);

  // Toggle amenity selection
  const toggleAmenity = (amenity) => {
    setFormData((prev) => {
      const exists = prev.amenities.includes(amenity);
      return {
        ...prev,
        amenities: exists
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity]
      };
    });
  };

  // Save or Update Space
  const handleSaveSpace = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setNotice({ text: 'Please enter a name for this architectural space.', type: 'warning' });
      return;
    }
    const capacityNum = Number(formData.capacity);
    if (!Number.isInteger(capacityNum) || capacityNum < 1) {
      setNotice({ text: 'Capacity must be at least 1 seat.', type: 'warning' });
      return;
    }

    setApiBusy(true);

    const spacePayload = {
      ...formData,
      capacity: capacityNum,
      rate: Number(formData.rate) || 0,
      id: editingSpaceId || `arch-${currentBranch.toLowerCase().slice(0, 4)}-${formData.type.slice(0, 3)}-${Date.now().toString().slice(-5)}`
    };

    // If API enabled, attempt to sync to backend
    if (isApiEnabled) {
      try {
        const apiPayload = {
          name: spacePayload.name,
          branch: spacePayload.branch,
          floor: spacePayload.floor,
          type: SPACE_TYPES[spacePayload.type]?.label || spacePayload.type,
          capacity: spacePayload.capacity,
          status: spacePayload.status === 'Available' ? 'Active' : spacePayload.status
        };
        if (editingSpaceId && !editingSpaceId.startsWith('arch-')) {
          await api.workspaces.update(editingSpaceId, apiPayload);
        } else {
          await api.workspaces.create(apiPayload);
        }
        if (onRefreshApi) onRefreshApi();
      } catch (err) {
        console.warn('API sync failed, continuing with local persistence:', err);
      }
    }

    // Update local architecture state
    const currentList = allArchitecture[currentBranch] || [];
    let updatedList;
    if (editingSpaceId) {
      updatedList = currentList.map((item) => (item.id === editingSpaceId ? { ...item, ...spacePayload } : item));
    } else {
      updatedList = [...currentList, spacePayload];
    }

    const updatedArchitecture = {
      ...allArchitecture,
      [currentBranch]: updatedList
    };

    updateArchitecture(updatedArchitecture);
    setSpaceModalOpen(false);
    setApiBusy(false);
    setNotice({
      text: editingSpaceId ? `Updated "${spacePayload.name}" successfully.` : `Added "${spacePayload.name}" to ${currentBranch} architecture.`,
      type: 'success'
    });
  };

  // Duplicate a space
  const handleDuplicateSpace = (space) => {
    const timestamp = Date.now().toString().slice(-4);
    const newName = `${space.name} (Copy)`;
    const newSpace = {
      ...space,
      id: `arch-${currentBranch.toLowerCase().slice(0, 4)}-${space.type.slice(0, 3)}-${timestamp}`,
      name: newName,
      status: 'Available',
      assignedCustomer: null
    };

    const currentList = allArchitecture[currentBranch] || [];
    const updatedList = [...currentList, newSpace];
    updateArchitecture({ ...allArchitecture, [currentBranch]: updatedList });

    setNotice({ text: `Duplicated "${space.name}" as "${newName}".`, type: 'success' });
  };

  // Toggle Space Status (Available <-> Occupied)
  const handleToggleStatus = (space) => {
    const newStatus = space.status === 'Available' ? 'Occupied' : 'Available';
    const currentList = allArchitecture[currentBranch] || [];
    const updatedList = currentList.map((item) => {
      if (item.id === space.id) {
        return {
          ...item,
          status: newStatus,
          assignedCustomer: newStatus === 'Available' ? null : item.assignedCustomer
        };
      }
      return item;
    });

    updateArchitecture({ ...allArchitecture, [currentBranch]: updatedList });
    setNotice({ text: `Set "${space.name}" status to ${newStatus}.`, type: 'info' });
  };

  // Delete a space with confirmation popup
  const promptDeleteSpace = (space) => {
    setSpaceToDelete(space);
  };

  const confirmDeleteSpace = async () => {
    if (!spaceToDelete) return;
    const space = spaceToDelete;
    setSpaceToDelete(null);

    // Try API remove if applicable
    if (isApiEnabled && !space.id.startsWith('arch-')) {
      try {
        if (api.workspaces.remove) await api.workspaces.remove(space.id);
        if (onRefreshApi) onRefreshApi();
      } catch (err) {
        console.warn('API deletion error:', err);
      }
    }

    const currentList = allArchitecture[currentBranch] || [];
    const updatedList = currentList.filter((item) => item.id !== space.id);
    updateArchitecture({ ...allArchitecture, [currentBranch]: updatedList });

    setNotice({ text: `Removed "${space.name}" from architecture.`, type: 'warning' }); showSuccess(`Removed "${space.name}" from architecture.`);
  };

  // Deploy an Architecture Preset
  const handleDeployPreset = (presetType) => {
    const targetFloor = selectedFloor === 'All' ? 'Ground Floor' : selectedFloor;
    const generatedUnits = createArchitecturePreset(currentBranch, presetType, targetFloor);

    const currentList = allArchitecture[currentBranch] || [];
    const updatedList = [...currentList, ...generatedUnits];

    updateArchitecture({ ...allArchitecture, [currentBranch]: updatedList });
    setPresetDropdownOpen(false);

    setNotice({
      text: `Successfully deployed architecture floor setup (4 Private Cabins, 1 Conference Room, 1 Podcast Studio) for ${currentBranch}!`,
      type: 'success'
    });
  };

  // Open Assign Customer Modal
  const openAssignModal = (space) => {
    setAssigningSpace(space);
    setAssignedCustomerId(space.assignedCustomer?.id || '');
    setAssignModalOpen(true);
  };

  // Save Customer Assignment
  const handleSaveAssignment = () => {
    if (!assigningSpace) return;
    const customer = customers.find((c) => c.id === assignedCustomerId);

    const currentList = allArchitecture[currentBranch] || [];
    const updatedList = currentList.map((item) => {
      if (item.id === assigningSpace.id) {
        return {
          ...item,
          status: customer ? 'Occupied' : 'Available',
          assignedCustomer: customer
            ? { id: customer.id, name: customer.name || customer.fullName, company: customer.company || customer.companyName || customer.name }
            : null
        };
      }
      return item;
    });

    updateArchitecture({ ...allArchitecture, [currentBranch]: updatedList });
    setAssignModalOpen(false);
    setNotice({
      text: customer
        ? `Assigned ${customer.name} to "${assigningSpace.name}".`
        : `Unassigned customer from "${assigningSpace.name}".`,
      type: 'success'
    });
  };

  const activeTypeDef = SPACE_TYPES[formData.type] || SPACE_TYPES.private_cabin;

  return (
    <div className="workspace-architecture-studio mb-5">
      {/* Impressive Studio Header & Branch Selector */}
      <div className="arch-studio-header">
        <div className="arch-brand-title">
          <div className="arch-eyebrow">
            <FiZap className="me-1 text-warning" />
            <span>INTERACTIVE WORKSPACE ARCHITECT</span>
          </div>
          <h2>Branch Architecture & Space Customizer</h2>
          <p>
            Configure physical floor layouts, construct private cabins with custom seating (5, 10, 20 seats),
            conference boardrooms, and acoustic podcast studios for any NanoSpace branch.
          </p>
        </div>

        {/* Branch Selector Bar */}
        <div className="arch-branch-selector-wrap">
          <div className="selector-label">
            <FiMapPin className="me-1" />
            <strong>Select Branch to Architect:</strong>
          </div>
          <div className="arch-branch-pills">
            {branches.map((branch) => {
              const count = (allArchitecture[branch] || []).length;
              const cap = (allArchitecture[branch] || []).reduce((s, u) => s + (Number(u.capacity) || 0), 0);
              const isActive = branch === currentBranch;
              return (
                <button
                  key={branch}
                  type="button"
                  className={`arch-branch-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleBranchChange(branch)}
                >
                  <span className="branch-name">{branch}</span>
                  <span className="branch-meta">
                    {count} spaces · {cap} seats
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {notice.text && (
        <Alert
          color={notice.type}
          className="d-flex align-items-center justify-content-between mb-4 shadow-sm"
          toggle={() => setNotice({ text: '', type: 'info' })}
        >
          <div className="d-flex align-items-center gap-2">
            <FiInfo />
            <span>{notice.text}</span>
          </div>
        </Alert>
      )}

      {/* Branch Architecture Stats Overview */}
      <Row className="g-3 mb-4">
        <Col sm="6" xl="3">
          <StatMetricCard
            icon={FiShield}
            label="Private Cabins"
            value={`${stats.cabinsCount} Cabins`}
            hint={`${stats.cabinCapacity} Total Cabin Seats (20s, 10s, 5s)`}
            tone="blue"
          />
        </Col>
        <Col sm="6" xl="3">
          <StatMetricCard
            icon={FiMonitor}
            label="Conference Boardrooms"
            value={`${stats.confCount} Rooms`}
            hint={`${stats.confCapacity} Meeting Seats (10-Seater AV)`}
            tone="purple"
          />
        </Col>
        <Col sm="6" xl="3">
          <StatMetricCard
            icon={FiMic}
            label="Podcast Studios"
            value={`${stats.podcastsCount} Studios`}
            hint={`${stats.podcastCapacity} Acoustic Seating (Shure Mics)`}
            tone="orange"
          />
        </Col>
        <Col sm="6" xl="3">
          <StatMetricCard
            icon={FiUsers}
            label="Total Branch Capacity"
            value={`${stats.totalCapacity} Seats`}
            hint={`${stats.occupancyRate}% Floor Occupancy Rate`}
            tone="green"
          />
        </Col>
      </Row>

      {/* Interactive Controls & Filters Toolbar */}
      <div className="arch-action-toolbar mb-4">
        <div className="toolbar-left">
          {/* Floor Level Filter */}
          <div className="toolbar-control-group">
            <span className="control-label">Floor:</span>
            <div className="btn-group floor-toggle-group">
              <Button
                color="light"
                size="sm"
                className={`filter-btn ${selectedFloor === 'All' ? 'active-filter' : ''}`}
                onClick={() => setSelectedFloor('All')}
              >
                All Floors
              </Button>
              {availableFloors.map((fl) => (
                <Button
                  key={fl}
                  color="light"
                  size="sm"
                  className={`filter-btn ${selectedFloor === fl ? 'active-filter' : ''}`}
                  onClick={() => setSelectedFloor(fl)}
                >
                  {fl}
                </Button>
              ))}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="toolbar-control-group">
            <span className="control-label">Type:</span>
            <div className="btn-group category-toggle-group">
              <Button
                color="light"
                size="sm"
                className={`filter-btn ${categoryFilter === 'all' ? 'active-filter' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All ({branchSpaces.length})
              </Button>
              <Button
                color="light"
                size="sm"
                className={`filter-btn ${categoryFilter === 'private_cabin' ? 'active-filter' : ''}`}
                onClick={() => setCategoryFilter('private_cabin')}
              >
                Cabins ({stats.cabinsCount})
              </Button>
              <Button
                color="light"
                size="sm"
                className={`filter-btn ${categoryFilter === 'conference_room' ? 'active-filter' : ''}`}
                onClick={() => setCategoryFilter('conference_room')}
              >
                Conference ({stats.confCount})
              </Button>
              <Button
                color="light"
                size="sm"
                className={`filter-btn ${categoryFilter === 'podcast_room' ? 'active-filter' : ''}`}
                onClick={() => setCategoryFilter('podcast_room')}
              >
                Podcast ({stats.podcastsCount})
              </Button>
            </div>
          </div>
        </div>

        {/* Toolbar Right: Action Buttons */}
        <div className="toolbar-right">
          {/* Search Field */}
          <div className="arch-search-wrap">
            <FiSearch className="search-icon" />
            <Input
              type="text"
              placeholder="Search space or tenant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="arch-search-input"
            />
          </div>

          {/* Deploy Architecture Preset Button */}
          <Dropdown isOpen={presetDropdownOpen} toggle={() => setPresetDropdownOpen(!presetDropdownOpen)}>
            <DropdownToggle color="light" className="btn-preset-toggle">
              <FiZap className="me-1 text-warning" />
              <span>Presets</span>
            </DropdownToggle>
            <DropdownMenu end className="shadow-lg arch-preset-menu">
              <div className="preset-menu-header">
                <strong>Floor Architecture Presets</strong>
                <small>Deploy 1-click layouts into {currentBranch}</small>
              </div>
              <DropdownItem onClick={() => handleDeployPreset('standard_enterprise')} className="preset-item">
                <div className="fw-bold text-primary">Standard Enterprise Layout</div>
                <div className="small text-muted">
                  4 Private Cabins (20s, 10s, 10s, 5s) + 1 Conference (10s) + 1 Podcast Room
                </div>
              </DropdownItem>
              <DropdownItem onClick={() => handleDeployPreset('startup_incubator')} className="preset-item">
                <div className="fw-bold text-success">Tech Startup Floor</div>
                <div className="small text-muted">
                  2 Private Cabins (10s, 5s) + 1 Conference (10s) + 1 Podcast Studio + 12 Hot Desks
                </div>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          {/* Add Space Primary Action Button */}
          <Button color="primary" className="btn-primary-custom" onClick={() => openAddModal('private_cabin')}>
            <FiPlus className="me-1" />
            <span>Add Architectural Space</span>
          </Button>
        </div>
      </div>

      {/* Visual Architectural Canvas Grid */}
      {filteredSpaces.length === 0 ? (
        <Card className="panel-card border-0 text-center py-5">
          <CardBody>
            <div className="empty-arch-graphic mb-3">
              <FiSliders className="text-secondary" style={{ fontSize: '48px' }} />
            </div>
            <h4>No architectural spaces configured for this view</h4>
            <p className="text-secondary max-w-md mx-auto mb-4">
              Get started by adding individual private cabins, conference rooms, or deploy a complete 1-click architectural preset.
            </p>
            <div className="d-flex justify-content-center gap-3">
              <Button color="primary" className="btn-primary-custom" onClick={() => handleDeployPreset('standard_enterprise')}>
                <FiZap className="me-2" />
                Deploy 4 Cabins + 1 Conf + 1 Podcast
              </Button>
              <Button color="light" onClick={() => openAddModal('private_cabin')}>
                <FiPlus className="me-1" /> Add Single Space
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Row className="g-4">
          {filteredSpaces.map((space) => {
            const typeConfig = SPACE_TYPES[space.type] || SPACE_TYPES.private_cabin;
            const isOccupied = space.status === 'Occupied';
            const isAvailable = space.status === 'Available';

            return (
              <Col key={space.id} xs="12" md="6" xl="4">
                <Card className={`arch-room-card ${space.type}-card ${isOccupied ? 'is-occupied' : ''}`}>
                  <CardBody className="p-4 d-flex flex-column justify-content-between">
                    {/* Top Row: Type Badge, Floor Tag, Status Switcher */}
                    <div>
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className={`arch-type-badge ${typeConfig.badgeTone}`}>
                            {space.type === 'private_cabin' && <FiShield className="badge-icon" />}
                            {space.type === 'conference_room' && <FiMonitor className="badge-icon" />}
                            {space.type === 'podcast_room' && <FiMic className="badge-icon" />}
                            {space.type === 'hot_desk' && <FiGrid className="badge-icon" />}
                            <span>{typeConfig.shortLabel}</span>
                          </span>
                          <span className="arch-floor-tag">{space.floor || 'Ground Floor'}</span>
                        </div>

                        {/* Interactive Status Pill Button */}
                        <button
                          type="button"
                          className={`arch-status-pill ${space.status.toLowerCase()}`}
                          onClick={() => handleToggleStatus(space)}
                          title="Click to toggle status"
                        >
                          <span className="status-dot" />
                          <span>{space.status}</span>
                        </button>
                      </div>

                      {/* Room Name & Seating Capacity */}
                      <div className="arch-card-title-row mb-3">
                        <h4 className="arch-room-name">{space.name}</h4>
                        <div className="arch-capacity-badge">
                          <FiUsers className="me-1" />
                          <strong>{space.capacity}</strong>
                          <span>SEATS</span>
                        </div>
                      </div>

                      {/* Interactive Visual Room Blueprint Visualizer */}
                      <div className="arch-visual-canvas-wrap mb-3">
                        <WorkspaceRoomBlueprint
                          type={space.type}
                          capacity={space.capacity}
                          status={space.status}
                          compact={false}
                          interactive={false}
                        />
                      </div>

                      {/* Tenant Assignment Banner (if occupied) */}
                      {isOccupied && space.assignedCustomer && (
                        <div className="arch-tenant-banner mb-3">
                          <FiUserCheck className="tenant-icon" />
                          <div className="tenant-info">
                            <span className="tenant-title">Assigned Tenant:</span>
                            <strong className="tenant-name">{space.assignedCustomer.company || space.assignedCustomer.name}</strong>
                          </div>
                        </div>
                      )}

                      {/* Amenities Pills */}
                      <div className="arch-amenities-wrap mb-3">
                        {Array.isArray(space.amenities) &&
                          space.amenities.slice(0, 4).map((amenity) => (
                            <span key={amenity} className="arch-amenity-chip">
                              <FiCheck className="chip-check" />
                              <span>{amenity}</span>
                            </span>
                          ))}
                        {space.amenities?.length > 4 && (
                          <span className="arch-amenity-chip more-chip">
                            +{space.amenities.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Pricing & Actions */}
                    <div className="arch-card-footer pt-3 border-top">
                      <div className="arch-pricing-box">
                        <span className="price-val">
                          ₹{Number(space.rate || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="price-unit">/{space.rateUnit || 'month'}</span>
                      </div>

                      <div className="arch-action-btns">
                        {/* Assign / Book Button */}
                        <Button
                          color="light"
                          size="sm"
                          className="btn-action-icon"
                          title="Assign Tenant"
                          onClick={() => openAssignModal(space)}
                        >
                          <FiUserCheck />
                        </Button>

                        {/* Duplicate Button */}
                        <Button
                          color="light"
                          size="sm"
                          className="btn-action-icon"
                          title="Duplicate space"
                          onClick={() => handleDuplicateSpace(space)}
                        >
                          <FiCopy />
                        </Button>

                        {/* Edit Button */}
                        <Button
                          color="light"
                          size="sm"
                          className="btn-action-icon"
                          title="Edit space specs"
                          onClick={() => openEditModal(space)}
                        >
                          <FiEdit2 />
                        </Button>

                        {/* Delete Button */}
                        <Button
                          color="light"
                          size="sm"
                          className="btn-action-icon text-danger"
                          title="Remove from floor"
                          onClick={() => promptDeleteSpace(space)}
                        >
                          <FiTrash2 />
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT ARCHITECTURAL SPACE MODAL WITH LIVE INTERACTIVE PREVIEW */}
      {/* ========================================================================= */}
      <Modal
        isOpen={spaceModalOpen}
        toggle={() => setSpaceModalOpen(false)}
        size="lg"
        centered
        className="arch-studio-modal"
      >
        <ModalHeader toggle={() => setSpaceModalOpen(false)} className="border-0 pb-0">
          <div className="modal-title-wrap">
            <span className="eyebrow text-primary">NANOSPACE ARCHITECT STUDIO</span>
            <h3 className="modal-title-text">
              {editingSpaceId ? 'Configure Architectural Space' : 'Create New Architectural Space'}
            </h3>
            <p className="text-muted small mb-0">
              Branch: <strong>{formData.branch}</strong> · Define physical seating, room specifications & amenities.
            </p>
          </div>
        </ModalHeader>
        <ModalBody className="py-4">
          <Form onSubmit={handleSaveSpace}>
            <Row className="g-4">
              {/* Left Column: Form Fields */}
              <Col lg="7">
                {/* Space Type Selector Cards */}
                <FormGroup className="mb-3">
                  <Label className="form-label-custom">Select Space Category</Label>
                  <div className="space-type-picker-grid">
                    {Object.values(SPACE_TYPES).slice(0, 4).map((typeDef) => {
                      const isSelected = formData.type === typeDef.id;
                      return (
                        <button
                          key={typeDef.id}
                          type="button"
                          className={`type-picker-tile ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleTypeChangeInModal(typeDef.id)}
                        >
                          <div className="tile-icon-box">
                            {typeDef.id === 'private_cabin' && <FiShield />}
                            {typeDef.id === 'conference_room' && <FiMonitor />}
                            {typeDef.id === 'podcast_room' && <FiMic />}
                            {typeDef.id === 'dedicated_desk' && <FiGrid />}
                          </div>
                          <strong>{typeDef.label}</strong>
                          <small>{typeDef.defaultCapacity} seats default</small>
                        </button>
                      );
                    })}
                  </div>
                </FormGroup>

                {/* Name & Floor */}
                <Row className="g-3 mb-3">
                  <Col md="7">
                    <FormGroup>
                      <Label for="space-name-input" className="form-label-custom">
                        Space Identifier / Name
                      </Label>
                      <Input
                        id="space-name-input"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Private Cabin Alpha - 20 Seater"
                      />
                    </FormGroup>
                  </Col>
                  <Col md="5">
                    <FormGroup>
                      <Label for="space-floor-input" className="form-label-custom">
                        Floor Assignment
                      </Label>
                      <Input
                        id="space-floor-input"
                        type="select"
                        value={formData.floor}
                        onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                      >
                        {availableFloors.map((fl) => (
                          <option key={fl} value={fl}>
                            {fl}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  </Col>
                </Row>

                {/* Seating Capacity Controller with Presets (5, 10, 20 seats) */}
                <FormGroup className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <Label className="form-label-custom mb-0">Seating Capacity</Label>
                    <span className="badge bg-primary-subtle text-primary fw-bold">
                      {formData.capacity} Seats Configured
                    </span>
                  </div>
                  <div className="capacity-presets-row mb-2">
                    {activeTypeDef.capacityPresets.map((presetVal) => (
                      <button
                        key={presetVal}
                        type="button"
                        className={`btn-capacity-preset ${Number(formData.capacity) === presetVal ? 'active' : ''}`}
                        onClick={() => updateCapacity(presetVal)}
                      >
                        {presetVal} Seats
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.capacity}
                    onChange={(e) => updateCapacity(e.target.value)}
                    className="w-50"
                  />
                  <small className="text-muted">
                    Custom seating count (e.g. 5, 10, 20 seats).
                  </small>
                </FormGroup>

                {/* Pricing & Billing Unit */}
                <Row className="g-3 mb-3">
                  <Col md="7">
                    <FormGroup>
                      <Label for="space-rate-input" className="form-label-custom">
                        Rental Pricing (₹)
                      </Label>
                      <Input
                        id="space-rate-input"
                        type="number"
                        min="0"
                        value={formData.rate}
                        onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                      />
                    </FormGroup>
                  </Col>
                  <Col md="5">
                    <FormGroup>
                      <Label for="space-unit-input" className="form-label-custom">
                        Billing Term
                      </Label>
                      <Input
                        id="space-unit-input"
                        type="select"
                        value={formData.rateUnit}
                        onChange={(e) => setFormData({ ...formData, rateUnit: e.target.value })}
                      >
                        <option value="month">Per Month</option>
                        <option value="session">Per Session (4 hrs)</option>
                        <option value="day">Per Day Pass</option>
                        <option value="hour">Per Hour</option>
                      </Input>
                    </FormGroup>
                  </Col>
                </Row>

                {/* Initial Status */}
                <FormGroup className="mb-3">
                  <Label for="space-status-input" className="form-label-custom">
                    Initial Status
                  </Label>
                  <Input
                    id="space-status-input"
                    type="select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Available">Available for Lease</option>
                    <option value="Occupied">Occupied / Booked</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Maintenance">Under Maintenance</option>
                  </Input>
                </FormGroup>

                {/* Amenities Multi-Select Chips */}
                <FormGroup className="mb-0">
                  <Label className="form-label-custom">Included Amenities & Hardware</Label>
                  <div className="amenities-checkbox-grid">
                    {AVAILABLE_AMENITIES.map((amenity) => {
                      const isChecked = formData.amenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          className={`amenity-toggle-chip ${isChecked ? 'checked' : ''}`}
                          onClick={() => toggleAmenity(amenity)}
                        >
                          <span className="chip-indicator">
                            {isChecked ? <FiCheck /> : '+'}
                          </span>
                          <span>{amenity}</span>
                        </button>
                      );
                    })}
                  </div>
                </FormGroup>
              </Col>

              {/* Right Column: Live Real-Time Interactive Blueprint Preview */}
              <Col lg="5">
                <div className="blueprint-preview-sticky">
                  <div className="preview-header mb-2">
                    <span className="eyebrow text-uppercase">LIVE BLUEPRINT PREVIEW</span>
                    <h5 className="mb-0">{formData.name || 'Room Blueprint'}</h5>
                    <small className="text-muted">
                      {formData.floor} · {formData.capacity} Seats Seating Plan
                    </small>
                  </div>

                  <div className="modal-blueprint-container p-3 rounded bg-light border mb-3">
                    <WorkspaceRoomBlueprint
                      type={formData.type}
                      capacity={formData.capacity}
                      status={formData.status}
                      compact={false}
                      interactive={true}
                    />
                  </div>

                  <div className="blueprint-spec-summary p-3 rounded border">
                    <div className="d-flex justify-content-between mb-2">
                      <span className="text-muted">Branch:</span>
                      <strong>{formData.branch}</strong>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span className="text-muted">Category:</span>
                      <strong>{activeTypeDef.label}</strong>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span className="text-muted">Capacity:</span>
                      <strong>{formData.capacity} Seats</strong>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Rate:</span>
                      <strong>
                        ₹{Number(formData.rate || 0).toLocaleString('en-IN')} / {formData.rateUnit}
                      </strong>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <Button color="light" type="button" onClick={() => setSpaceModalOpen(false)}>
                Cancel
              </Button>
              <Button color="primary" className="btn-primary-custom" type="submit" disabled={apiBusy}>
                {apiBusy ? 'Saving Architecture...' : editingSpaceId ? 'Save Configuration' : 'Create Space'}
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {/* ========================================================================= */}
      {/* QUICK ASSIGN TENANT / CUSTOMER MODAL */}
      {/* ========================================================================= */}
      <Modal isOpen={assignModalOpen} toggle={() => setAssignModalOpen(false)} centered>
        <ModalHeader toggle={() => setAssignModalOpen(false)}>
          Assign Tenant to {assigningSpace?.name}
        </ModalHeader>
        <ModalBody>
          <p className="text-muted small">
            Select a registered customer or enterprise company to assign to this {assigningSpace?.capacity}-seater space.
          </p>
          <FormGroup>
            <Label for="assign-customer-select">Choose Customer / Company</Label>
            <Input
              id="assign-customer-select"
              type="select"
              value={assignedCustomerId}
              onChange={(e) => setAssignedCustomerId(e.target.value)}
            >
              <option value="">-- No Tenant (Mark as Available) --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.fullName} {c.company ? `(${c.company})` : ''} · {c.phone || c.email}
                </option>
              ))}
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="light" onClick={() => setAssignModalOpen(false)}>
            Cancel
          </Button>
          <Button color="primary" className="btn-primary-custom" onClick={handleSaveAssignment}>
            Update Tenant Assignment
          </Button>
        </ModalFooter>
      </Modal>
      <DeleteConfirmModal
        isOpen={Boolean(spaceToDelete)}
        toggle={() => setSpaceToDelete(null)}
        onConfirm={confirmDeleteSpace}
        title="Are you sure you want to delete this space?"
        message={`Do you really want to remove "${spaceToDelete?.name || 'this space'}" from ${currentBranch}? This action cannot be undone.`}
        confirmText="OK, Delete"
        cancelText="Cancel"
      />
    </div>
  );
}
