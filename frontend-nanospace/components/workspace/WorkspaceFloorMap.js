import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FiCalendar, FiCopy, FiGrid, FiLayers, FiMaximize2, FiMinimize2, FiMinus, FiMonitor, FiPlus, FiRotateCcw, FiRotateCw, FiSearch, FiTrash2 } from 'react-icons/fi';
import { branchFloors } from '../../data/inventory';
import { api, getApiErrorMessage, getApiPayload, isApiEnabled } from '../../services/api';

const KonvaFloorCanvas = dynamic(() => import('./KonvaFloorCanvas'), {
  ssr: false,
  loading: () => <div className="konva-floor-loading">Loading floor layout…</div>,
});

const FLOOR_MIN_X = 36;
const FLOOR_MIN_Y = 86;
const FLOOR_MAX_X = 1284;
const FLOOR_MAX_Y = 744;

const isSpaceInBookingCategory = (space, category) => {
  if (!category) return true;
  const type = String(space.type || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const matches = {
    hot: /HOTDESK|FLEX|OPEN.?DESK/.test(type),
    dedicated: /DEDICATED/.test(type),
    office: /PRIVATE.?CABIN|CABIN|OFFICE/.test(type),
    meeting: /CONFERENCE|MEETING|BOARDROOM/.test(type),
    podcast: /PODCAST|STUDIO|RECORD/.test(type),
  };
  return Boolean(matches[category]);
};

const normalizeStatus = (status) => {
  const value = String(status || '').toUpperCase();
  if (['OCCUPIED', 'MAINTENANCE'].includes(value)) return 'Occupied';
  if (['BOOKED', 'RESERVED', 'REQUESTED', 'CONFIRMED'].includes(value)) return 'Booked';
  return 'Available';
};

const branchKey = (value) => String(value?.name || value || '').trim().toLowerCase();
const floorLabel = (index) => ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'][index] || `Floor ${index + 1}`;

export default function WorkspaceFloorMap({
  initialBranch = 'Nanakramguda',
  branches,
  branchFloorCounts = {},
  onSelectSeat,
  selectedSeat,
  availableSeatIds,
  availabilitySpaces,
  workspaceRecords,
  requestedSeatCount = 1,
  bookingCategory,
  onChangeBookingType,
  availabilityDate,
  bookings = [],
  bookingMode = false,
  availabilityReady = true,
  layoutEditable = false,
  adminLayout = false,
  publishingLayout = false,
  onPublishLayout,
  onSaveLayout,
  layoutOverrides = {},
  onLayoutChange,
}) {
  const [branch, setBranch] = useState(initialBranch);
  const [floor, setFloor] = useState('Ground Floor');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentAvailability, setCurrentAvailability] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(availabilityDate || new Date().toISOString().slice(0, 10));
  const [localSelectedSpaceId, setLocalSelectedSpaceId] = useState(null);
  const [layoutObjects, setLayoutObjects] = useState([]);
  const [layoutHasDraft, setLayoutHasDraft] = useState(false);
  const [layoutObjectsDirty, setLayoutObjectsDirty] = useState(false);
  const layoutHistoryRef = useRef([]);
  const layoutRedoRef = useRef([]);
  const [, setLayoutHistoryVersion] = useState(0);
  const [canvasFullWidth, setCanvasFullWidth] = useState(false);
  const [selectedLayoutObjectId, setSelectedLayoutObjectId] = useState(null);
  const [selectedLayoutObjectIds, setSelectedLayoutObjectIds] = useState([]);
  const selectLayoutObject = (id, additive = false) => {
    if (!id) {
      setSelectedLayoutObjectId(null);
      setSelectedLayoutObjectIds([]);
      return;
    }
    setSelectedLayoutObjectIds((current) => {
      if (!additive) {
        setSelectedLayoutObjectId(id);
        return [id];
      }
      const exists = current.includes(id);
      const next = exists ? current.filter((selectedId) => selectedId !== id) : [...current, id];
      setSelectedLayoutObjectId(next.length ? next[next.length - 1] : null);
      return next;
    });
  };
  const [capacityInput, setCapacityInput] = useState('');
  const commitLayoutObjects = (updater) => {
    setLayoutObjects((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (JSON.stringify(current) === JSON.stringify(next)) return current;
      layoutHistoryRef.current = [...layoutHistoryRef.current.slice(-49), current.map((object) => ({ ...object }))];
      layoutRedoRef.current = [];
      setLayoutHistoryVersion((version) => version + 1);
      return next;
    });
    setLayoutObjectsDirty(true);
  };

  const undoLayout = () => {
    if (!layoutHistoryRef.current.length) return;
    const previous = layoutHistoryRef.current.pop();
    layoutRedoRef.current = [...layoutRedoRef.current.slice(-49), layoutObjects.map((object) => ({ ...object }))];
    setLayoutObjects(previous.map((object) => ({ ...object })));
    setLayoutHistoryVersion((version) => version + 1);
    setLayoutObjectsDirty(true);
  };

  const redoLayout = () => {
    if (!layoutRedoRef.current.length) return;
    const next = layoutRedoRef.current.pop();
    layoutHistoryRef.current = [...layoutHistoryRef.current.slice(-49), layoutObjects.map((object) => ({ ...object }))];
    setLayoutObjects(next.map((object) => ({ ...object })));
    setLayoutHistoryVersion((version) => version + 1);
    setLayoutObjectsDirty(true);
  };

  const [quickMakerStep, setQuickMakerStep] = useState(1);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [quickLayout, setQuickLayout] = useState({
    conferenceCount: 0, conferenceSeats: 10,
    openCabinsCount: 0, openCabinSeats: 6,
    podcastRooms: 0, cafeterias: 0, toilets: 0,
  });
  const [cabinGroups, setCabinGroups] = useState([
    { id: 'cabin-default', name: 'Private cabin', count: 0, seats: 6 },
  ]);
  const updateCabinGroup = (id, field, value) => {
    setCabinGroups((current) => current.map((group) => group.id === id ? { ...group, [field]: value } : group));
  };
  const addCabinGroup = () => {
    setCabinGroups((current) => [...current, {
      id: `cabin-${Date.now()}-${current.length}`,
      name: current.length ? `Cabin type ${current.length + 1}` : 'Private cabin',
      count: 0,
      seats: 6,
    }]);
  };
  const [layoutLoadError, setLayoutLoadError] = useState('');
  const savedLayoutObjects = useRef([]);
  const [zoom, setZoom] = useState(1);
  const branchOptions = (branches || Object.keys(branchFloors)).filter((name) => name && name !== 'All Branches');
  const defaultFloorCount = branchKey(branch) === 'nanakramguda' ? 1 : branchFloors[branch]?.length || 1;
  const floorCount = Number(branchFloorCounts[branch] ?? defaultFloorCount);
  const workspaceFloorNames = [
    ...new Set((Array.isArray(workspaceRecords) ? workspaceRecords : []).filter((workspace) =>
      branchKey(workspace.branch_name || workspace.branch) === branchKey(branch)
    ).map((workspace) => workspace.floor).filter(Boolean)),
  ];
  const generatedFloorNames = Array.from({ length: Math.max(floorCount, 1) }, (_, index) => floorLabel(index));
  const floorOptions = [
    ...generatedFloorNames,
    ...workspaceFloorNames.filter((name) => !generatedFloorNames.includes(name)),
  ];
  const activeDate = bookingMode ? availabilityDate || selectedDate : selectedDate;
  const availabilityContext = `${branch}|${activeDate}`;

  useEffect(() => {
    if (!isApiEnabled) {
      return undefined;
    }

    let active = true;
    api.workspaces.layout({ branch, floor })
      .then((response) => {
        const result = getApiPayload(response);
        const objects = Array.isArray(result?.objects) ? result.objects : [];
        if (!active) return;
        setLayoutObjects(objects);
        savedLayoutObjects.current = objects;
        setLayoutHasDraft(Boolean(result?.hasDraft));
        setLayoutObjectsDirty(false);
        setSelectedLayoutObjectId(null);
        setSelectedLayoutObjectIds([]);
        setLayoutLoadError('');
      })
      .catch((error) => {
        if (!active) return;
        setLayoutLoadError(getApiErrorMessage(error, 'Could not load custom floor objects.'));
      });
    return () => { active = false; };
  }, [branch, floor]);

  useEffect(() => {
    if (!layoutEditable && layoutObjectsDirty) {
      setLayoutObjects(savedLayoutObjects.current);
      setLayoutObjectsDirty(false);
      setSelectedLayoutObjectId(null);
      setSelectedLayoutObjectIds([]);
    }
  }, [layoutEditable, layoutObjectsDirty]);

  useEffect(() => {
    if (!isApiEnabled || bookingMode) return undefined;
    let active = true;
    api.bookings.availability({ branch, date: activeDate })
      .then((response) => {
        const result = getApiPayload(response);
        if (active) {
          setCurrentAvailability({
            context: availabilityContext,
            spaces: Array.isArray(result?.workspaces) ? result.workspaces : [],
          });
        }
      })
      .catch((error) => {
        if (active) {
          setCurrentAvailability({
            context: availabilityContext,
            error: getApiErrorMessage(error, 'Could not load workspace availability.'),
          });
        }
      });
    return () => { active = false; };
  }, [activeDate, availabilityContext, branch, bookingMode]);

  const matchingCurrentAvailability = currentAvailability?.context === availabilityContext
    ? currentAvailability
    : null;
  const activeAvailabilitySpaces = bookingMode
    ? availabilitySpaces
    : matchingCurrentAvailability?.spaces;

  const spaces = useMemo(() => {
    const defaults = [];
    const records = Array.isArray(workspaceRecords)
      ? workspaceRecords.filter((workspace) =>
        branchKey(workspace.branch_name || workspace.branch) === branchKey(branch) &&
        (workspace.floor || 'Ground Floor') === floor
      )
      : [];
    const availability = Array.isArray(activeAvailabilitySpaces) ? activeAvailabilitySpaces : null;
    const allBranchRecords = Array.isArray(workspaceRecords)
      ? workspaceRecords.filter((workspace) => branchKey(workspace.branch_name || workspace.branch) === branchKey(branch))
      : [];
    const recordsByCode = new Map(allBranchRecords.map((workspace) => [
      String(workspace.code || '').toLowerCase(),
      workspace,
    ]));
    const positionedRecords = records.filter((workspace) =>
      workspace.layout_published === true ||
      workspace.draft_layout_x != null || workspace.draft_layout_y != null ||
      workspace.layout_x != null || workspace.layout_y != null
    );
    const source = adminLayout
      ? positionedRecords
      : availability !== null
      ? availability.filter((workspace) => (recordsByCode.get(String(workspace.code || '').toLowerCase())?.floor || 'Ground Floor') === floor).map((workspace) => ({
        ...(recordsByCode.get(String(workspace.code || '').toLowerCase()) || {}),
        ...workspace,
      }))
      : records.length ? records : defaults;
    const availabilityById = new Map();
    const availabilityByCode = new Map();
    const availableIds = new Set((availableSeatIds || []).map((id) => String(id).toLowerCase()));

    availability?.forEach((workspace) => {
      if (workspace.id) availabilityById.set(String(workspace.id), workspace);
      if (workspace.code) availabilityByCode.set(String(workspace.code).toLowerCase(), workspace);
    });

    return source.map((workspace, index) => {
      const code = workspace.code || workspace.name || `Workspace ${index + 1}`;
      const layout = null;
      const dateStatus = availabilityById.get(String(workspace.id || '')) ||
        availabilityByCode.get(String(code).toLowerCase());
      const listedAvailable = [workspace.id, code, workspace.name]
        .filter(Boolean)
        .some((id) => availableIds.has(String(id).toLowerCase()));
      const status = dateStatus
        ? normalizeStatus(dateStatus.status)
        : bookingMode && Array.isArray(availableSeatIds)
          ? listedAvailable ? 'Available' : normalizeStatus(workspace.status) === 'Occupied' ? 'Occupied' : 'Booked'
        : normalizeStatus(workspace.status);
      const position = layout || {
        x: 60 + (index % 4) * 295,
        y: 140 + Math.floor(index / 4) * 280,
        width: 260,
        height: 220,
      };

      const capacity = Number(workspace.capacity || layout?.capacity) || 1;
      const overlappingSeatCount = bookingMode && !isApiEnabled
        ? bookings.reduce((total, booking) => {
          const bookingStatus = String(booking.status || '').toUpperCase();
          if (!['CONFIRMED', 'REQUESTED'].includes(bookingStatus)) return total;
          const bookedWorkspace = String(booking.workspaceId || booking.workspace_id || booking.seat || '').toLowerCase();
          if (![workspace.id, workspace.code, workspace.name].some((id) =>
            String(id || '').toLowerCase() === bookedWorkspace
          )) return total;
          const bookingStartAt = Date.parse(
            booking.startsAt || booking.starts_at || `${String(booking.date || booking.createdAt || '').slice(0, 10)}T00:00:00Z`
          );
          const bookingEndAt = Date.parse(booking.endsAt || booking.ends_at || '') ||
            bookingStartAt + (Number(booking.duration) || 1) * 86400000;
              const selectedDateStartAt = Date.parse(`${activeDate}T00:00:00Z`);
          return bookingStartAt < selectedDateStartAt + 86400000 && bookingEndAt > selectedDateStartAt
            ? total + Math.max(1, Number(booking.seatCount || booking.seat_count) || 1)
            : total;
        }, 0)
        : 0;
      const availableCapacity = availability
        ? Math.max(0, Number(workspace.availableCapacity ?? workspace.available_capacity ?? capacity) || 0)
        : Math.max(0, capacity - overlappingSeatCount);
      const effectiveStatus = availableCapacity === 0 && status === 'Available'
        ? 'Booked'
        : status;
      const savedPosition = layoutOverrides[String(workspace.id || code)];

      return {
        id: workspace.id || code,
        dbId: workspace.id,
        code,
        name: workspace.name || code,
        branch,
        floor: workspace.floor || floor,
        type: String(workspace.workspace_type || workspace.workspaceType || workspace.type || layout?.type || 'HOT_DESK').toUpperCase(),
        capacity,
        availableCapacity,
        bookedSeats: Number(workspace.bookedSeats ?? workspace.booked_seats) || overlappingSeatCount,
        status: effectiveStatus,
        layoutPublished: workspace.layout_published !== false,
        hasLayoutDraft: Boolean(workspace.layout_has_draft),
        layoutX: Number(savedPosition?.x ?? (adminLayout
          ? workspace.draft_layout_x ?? workspace.layout_x ?? workspace.layoutX ?? position.x
          : workspace.layout_x ?? workspace.layoutX ?? position.x)),
        layoutY: Number(savedPosition?.y ?? (adminLayout
          ? workspace.draft_layout_y ?? workspace.layout_y ?? workspace.layoutY ?? position.y
          : workspace.layout_y ?? workspace.layoutY ?? position.y)),
        layoutWidth: Number(workspace.layout_width ?? workspace.layoutWidth ?? position.width),
        layoutHeight: Number(workspace.layout_height ?? workspace.layoutHeight ?? position.height),
      };
    });
  }, [activeAvailabilitySpaces, activeDate, adminLayout, availableSeatIds, bookingMode, bookings, branch, floor, layoutOverrides, workspaceRecords]);

  const bookingSpaces = bookingMode
    ? spaces.filter((space) => isSpaceInBookingCategory(space, bookingCategory))
    : spaces;
  const counts = useMemo(() => ({
    Available: bookingSpaces.filter((space) => space.status === 'Available').length,
    Booked: bookingSpaces.filter((space) => space.status === 'Booked').length,
    Occupied: bookingSpaces.filter((space) => space.status === 'Occupied').length,
  }), [bookingSpaces]);

  const filteredSpaces = spaces.filter((space) => {
    const matchesStatus = layoutEditable || statusFilter === 'All' || space.status === statusFilter;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = layoutEditable || !normalizedQuery || [
      space.name,
      space.code,
      space.type.replace(/_/g, ' '),
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesSearch;
  });
  const selectableSpaces = bookingMode ? bookingSpaces : filteredSpaces;
  const activeSelectedSpace = selectableSpaces.find((space) =>
    [space.id, space.dbId, space.code].some((id) => String(id || '') === String(selectedSeat || localSelectedSpaceId || ''))
  ) || selectableSpaces[0] || (bookingMode ? null : spaces[0]) || null;
  const hasApiRecords = Array.isArray(workspaceRecords) || Array.isArray(availabilitySpaces);
  const hasLayoutDraft = spaces.some((space) => !space.layoutPublished || space.hasLayoutDraft);
  const isLoadingAvailability = bookingMode
    ? !availabilityReady
    : isApiEnabled && !matchingCurrentAvailability;

  const selectSpace = (space) => {
    if (layoutEditable) return;
    if (bookingMode && (space.status !== 'Available' || space.availableCapacity < requestedSeatCount)) return;
    setLocalSelectedSpaceId(String(space.dbId || space.id));
    onSelectSeat?.({
      ...space,
      id: space.dbId || space.id,
      dbId: space.dbId || space.id,
      code: space.code,
    });
  };

  const showSpaceDetails = (space) => {
    if (!space) return;
    setLocalSelectedSpaceId(String(space.dbId || space.id));
    if (bookingMode) selectSpace(space);
  };

  const toggleCanvasFullWidth = () => setCanvasFullWidth((expanded) => !expanded);

  const addFloorObject = (type, customLabel) => {
    if (!layoutEditable) return;
    const dimensions = {
      desk: { width: 100, height: 56, label: 'DESK' },
      chair: { width: 42, height: 42, label: 'CHAIR' },
      cabin: { width: 210, height: 160, label: 'CABIN', capacity: 4 },
      table: { width: 150, height: 76, label: 'TABLE', capacity: 4 },
      private_cabin: { width: 220, height: 180, label: 'PRIVATE CABIN', capacity: 4 },
      conference_room: { width: 280, height: 190, label: 'CONFERENCE ROOM', capacity: 8 },
      open_desk: { width: 260, height: 180, label: 'OPEN DESK AREA', capacity: 10 },
      bathroom: { width: 140, height: 110, label: 'RESTROOM' },
      podcast_room: { width: 190, height: 110, label: 'PODCAST ROOM' },
      cafeteria: { width: 280, height: 180, label: 'CAFETERIA' },
      reception: { width: 230, height: 120, label: 'RECEPTION' },
      pantry: { width: 170, height: 110, label: 'PANTRY' },
      meeting_room: { width: 220, height: 160, label: 'MEETING ROOM', capacity: 6 },
      corridor: { width: 300, height: 55, label: 'CORRIDOR' },
      wall: { width: 260, height: 18, label: '' },
      external_wall: { width: 320, height: 24, label: '' },
      internal_wall: { width: 220, height: 14, label: '' },
      glass_partition: { width: 220, height: 12, label: 'GLASS PARTITION' },
      door: { width: 80, height: 80, label: 'DOOR' },
      lift: { width: 110, height: 110, label: 'LIFT' },
      stairs: { width: 130, height: 180, label: 'STAIRS' },
      storage: { width: 150, height: 110, label: 'STORAGE' },
      lounge: { width: 220, height: 150, label: 'LOUNGE' },
      named_area: { width: 220, height: 150, label: 'NEW AREA' },
      plant: { width: 44, height: 44, label: 'PLANT' },
      sofa: { width: 180, height: 70, label: 'SOFA' },
      reception_counter: { width: 220, height: 58, label: 'RECEPTION COUNTER' },
    }[type];
    if (!dimensions) return;
    const id = globalThis.crypto?.randomUUID?.() || `floor-object-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const offset = layoutObjects.length % 6;
    const object = {
      id,
      type,
      x: 70 + offset * 54,
      y: 100 + (Math.floor(layoutObjects.length / 6) % 4) * 54,
      rotation: 0,
      ...dimensions,
      ...(customLabel ? { label: customLabel } : {}),
    };
    commitLayoutObjects((current) => [...current, object]);
    setSelectedLayoutObjectId(id);
    setSelectedLayoutObjectIds([id]);
    setLayoutObjectsDirty(true);
  };

  const resetQuickLayoutExample = () => {
    setQuickLayout({
      conferenceCount: 1, conferenceSeats: 10,
      openCabinsCount: 4, openCabinSeats: 6,
      podcastRooms: 1, cafeterias: 1, toilets: 1,
    });
    setCabinGroups([
      { id: 'cabin-20', name: '20-seater cabins', count: 3, seats: 20 },
      { id: 'cabin-10', name: '10-seater cabins', count: 4, seats: 10 },
    ]);
    setQuickMakerStep(1);
  };

  const clearGeneratedLayout = () => {
    commitLayoutObjects([]);
    setSelectedLayoutObjectId(null);
    setSelectedLayoutObjectIds([]);
  };

  const autoCreateFloorLayout = () => {
    const makeId = () => globalThis.crypto?.randomUUID?.() || `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const count = (key) => Math.max(0, Math.min(20, Number(quickLayout[key]) || 0));
    const seats = (key) => Math.max(1, Math.min(500, Number(quickLayout[key]) || 1));
    const objects = [
      { id: makeId(), type: 'external_wall', x: 36, y: 86, width: 1248, height: 16 },
      { id: makeId(), type: 'external_wall', x: 36, y: 728, width: 1248, height: 16 },
      { id: makeId(), type: 'external_wall', x: 36, y: 86, width: 16, height: 658 },
      { id: makeId(), type: 'external_wall', x: 1268, y: 86, width: 16, height: 658 },
      { id: makeId(), type: 'reception_counter', x: 70, y: 650, width: 280, height: 58, label: 'RECEPTION' },
    ];
    const placed = [];
    let cursorX = 70;
    let cursorY = 120;
    let rowHeight = 0;
    const addItems = (quantity, item, width, height) => {
      for (let index = 0; index < quantity; index += 1) {
        if (cursorX + width > 1284) {
          cursorX = 70;
          cursorY += rowHeight + 24;
          rowHeight = 0;
        }
        if (cursorY + height > 620) break;
        const positioned = { ...item(index), x: cursorX, y: cursorY, width, height };
        placed.push(positioned);
        cursorX += width + 24;
        rowHeight = Math.max(rowHeight, height);
        if (cursorX + width > 1284) {
          cursorX = 70;
          cursorY += rowHeight + 24;
          rowHeight = 0;
        }
      }
    };
    cabinGroups.forEach((group) => {
      const quantity = Math.max(0, Math.min(20, Number(group.count) || 0));
      const capacity = Math.max(1, Math.min(500, Number(group.seats) || 1));
      const width = capacity >= 15 ? 220 : capacity >= 8 ? 180 : 160;
      const height = capacity >= 15 ? 150 : 130;
      addItems(quantity, () => ({
        id: makeId(),
        type: 'private_cabin',
        capacity,
        label: `${String(group.name || 'PRIVATE CABIN').toUpperCase()} · ${capacity} SEATER`,
      }), width, height);
    });
    const openSeats = seats('openCabinSeats');
    addItems(count('openCabinsCount'), () => ({ id: makeId(), type: 'open_desk', capacity: openSeats, label: `OPEN CABIN · ${openSeats} SEATER` }), 220, 150);
    const conferenceSeats = seats('conferenceSeats');
    addItems(count('conferenceCount'), () => ({ id: makeId(), type: 'conference_room', capacity: conferenceSeats, label: `CONFERENCE ROOM · ${conferenceSeats} SEATER` }), 300, 190);
    addItems(count('podcastRooms'), () => ({ id: makeId(), type: 'podcast_room', label: 'PODCAST ROOM' }), 180, 110);
    addItems(count('cafeterias'), () => ({ id: makeId(), type: 'cafeteria', label: 'CAFETERIA' }), 220, 130);
    addItems(count('toilets'), () => ({ id: makeId(), type: 'bathroom', label: 'TOILET' }), 120, 110);
    commitLayoutObjects([...objects, ...placed]);
    setSelectedLayoutObjectId(null);
    setSelectedLayoutObjectIds([]);
  };

  const moveFloorObject = (id, x, y) => {
    commitLayoutObjects((current) => {
      const dragged = current.find((object) => String(object.id) === String(id));
      if (!dragged) return current;
      const selection = selectedLayoutObjectIds.length ? selectedLayoutObjectIds : (selectedLayoutObjectId ? [selectedLayoutObjectId] : [id]);
      const selected = new Set(selection.map(String));
      if (!selected.has(String(id))) return current.map((object) => String(object.id) === String(id)
        ? { ...object, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }
        : object);
      const deltaX = Math.round(x / 10) * 10 - Number(dragged.x || 0);
      const deltaY = Math.round(y / 10) * 10 - Number(dragged.y || 0);
      return current.map((object) => {
        if (!selected.has(String(object.id))) return object;
        const width = Number(object.width) || 0;
        const height = Number(object.height) || 0;
        return {
          ...object,
          x: Math.max(FLOOR_MIN_X, Math.min(FLOOR_MAX_X - width, Math.round((Number(object.x || 0) + deltaX) / 10) * 10)),
          y: Math.max(FLOOR_MIN_Y, Math.min(FLOOR_MAX_Y - height, Math.round((Number(object.y || 0) + deltaY) / 10) * 10)),
        };
      });
    });
  };

  const resizeFloorObject = (id, width, height, x, y) => {
    commitLayoutObjects((current) => current.map((object) => String(object.id) === String(id)
      ? {
          ...object,
          width: Math.max(20, Math.min(600, Math.round(width))),
          height: Math.max(20, Math.min(600, Math.round(height))),
          ...(Number.isFinite(Number(x)) ? { x: Math.max(FLOOR_MIN_X, Math.min(FLOOR_MAX_X - Math.round(width), Math.round(x))) } : {}),
          ...(Number.isFinite(Number(y)) ? { y: Math.max(FLOOR_MIN_Y, Math.min(FLOOR_MAX_Y - Math.round(height), Math.round(y))) } : {}),
        }
      : object));
    setLayoutObjectsDirty(true);
  };

  const resizeSelectedFloorObject = (axis, amount) => {
    if (!selectedLayoutObjectId) return;
    commitLayoutObjects((current) => current.map((object) => {
      if (object.id !== selectedLayoutObjectId) return object;
      const width = axis === 'width' ? Math.max(20, Math.min(600, Number(object.width) + amount)) : object.width;
      const height = axis === 'height' ? Math.max(20, Math.min(600, Number(object.height) + amount)) : object.height;
      return { ...object, width: Math.round(width), height: Math.round(height) };
    }));
    setLayoutObjectsDirty(true);
  };

  const rotateSelectedFloorObject = (amount) => {
    if (!selectedLayoutObjectId) return;
    commitLayoutObjects((current) => current.map((object) => {
      if (object.id !== selectedLayoutObjectId) return object;
      const rotation = (Number(object.rotation || 0) + amount + 360) % 360;
      return { ...object, rotation };
    }));
    setLayoutObjectsDirty(true);
  };

  const alignSelectedFloorObject = (alignment) => {
    if (!selectedLayoutObjectId) return;
    commitLayoutObjects((current) => current.map((object) => {
      if (object.id !== selectedLayoutObjectId) return object;
      const width = Number(object.width || 0);
      const height = Number(object.height || 0);
      const positions = {
        left: { x: 10 },
        centerX: { x: Math.round((660 - width / 2) / 10) * 10 },
        right: { x: Math.round((1310 - width) / 10) * 10 },
        top: { y: 10 },
        centerY: { y: Math.round((390 - height / 2) / 10) * 10 },
        bottom: { y: Math.round((770 - height) / 10) * 10 },
      };
      return { ...object, ...(positions[alignment] || {}) };
    }));
    setLayoutObjectsDirty(true);
  };

  const snapSelectedToGrid = () => {
    if (!selectedLayoutObjectId) return;
    commitLayoutObjects((current) => current.map((object) => object.id === selectedLayoutObjectId
      ? { ...object, x: Math.round(object.x / 10) * 10, y: Math.round(object.y / 10) * 10 }
      : object));
    setLayoutObjectsDirty(true);
  };

  const straightenSelectedFloorObject = () => {
    updateSelectedFloorObject({ rotation: 0 });
  };

  const duplicateSelectedFloorObject = () => {
    if (!selectedLayoutObjectId) return;
    const selected = layoutObjects.find((object) => object.id === selectedLayoutObjectId);
    if (!selected) return;
    const id = globalThis.crypto?.randomUUID?.() || `floor-object-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const duplicate = {
      ...selected,
      id,
      x: Math.min(1250, Number(selected.x) + 30),
      y: Math.min(720, Number(selected.y) + 30),
    };
    commitLayoutObjects((current) => [...current, duplicate]);
    setSelectedLayoutObjectId(id);
    setSelectedLayoutObjectIds([id]);
    setLayoutObjectsDirty(true);
  };

  const updateSelectedFloorObject = (changes) => {
    if (!selectedLayoutObjectId) return;
    commitLayoutObjects((current) => current.map((object) =>
      object.id === selectedLayoutObjectId ? { ...object, ...changes } : object
    ));
    setLayoutObjectsDirty(true);
  };

  const updateSelectedCapacity = (value) => {
    if (!selectedLayoutObjectId) return;
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    if (!digits) return;
    const capacity = Math.max(1, Math.min(500, Number(digits) || 1));
    setCapacityInput(String(capacity));
    commitLayoutObjects((current) => current.map((object) => {
      if (object.id !== selectedLayoutObjectId) return object;
      if (!['cabin', 'private_cabin', 'conference_room', 'meeting_room', 'open_desk', 'desk', 'table'].includes(object.type)) return object;
      const columns = Math.ceil(Math.sqrt(capacity * 1.35));
      const suggestedWidth = object.type === 'conference_room' || object.type === 'meeting_room'
        ? Math.max(object.width, 220 + Math.ceil(capacity / 2) * 24)
        : Math.max(object.width, columns * 54 + 70);
      const suggestedHeight = object.type === 'conference_room' || object.type === 'meeting_room'
        ? Math.max(object.height, 150 + columns * 18)
        : Math.max(object.height, Math.ceil(capacity / columns) * 54 + 70);
      const baseName = {
        cabin: 'CABIN',
        private_cabin: 'PRIVATE CABIN',
        conference_room: 'CONFERENCE ROOM',
        meeting_room: 'MEETING ROOM',
        open_desk: 'OPEN DESK',
        desk: 'DESK',
        table: 'TABLE',
      }[object.type];
      return {
        ...object,
        capacity,
        label: `${baseName} · ${capacity} SEATER`,
        width: Math.min(600, suggestedWidth),
        height: Math.min(600, suggestedHeight),
      };
    }));
    setLayoutObjectsDirty(true);
  };

  const stepSelectedCapacity = (amount) => {
    const currentCapacity = Number(selectedLayoutObject?.capacity) || 1;
    updateSelectedCapacity(String(Math.max(1, Math.min(500, currentCapacity + amount))));
  };

  const removeSelectedFloorObject = () => {
    const ids = selectedLayoutObjectIds.length ? selectedLayoutObjectIds : (selectedLayoutObjectId ? [selectedLayoutObjectId] : []);
    if (!ids.length) return;
    const selected = new Set(ids.map(String));
    commitLayoutObjects((current) => current.filter((object) => !selected.has(String(object.id))));
    setSelectedLayoutObjectId(null);
    setSelectedLayoutObjectIds([]);
    setLayoutObjectsDirty(true);
  };

  const saveDraft = async () => {
    try {
      const sanitizedObjects = layoutObjects.map((object) => {
        const width = Math.max(20, Math.min(1320, Number(object.width) || 20));
        const height = Math.max(20, Math.min(780, Number(object.height) || 20));
        return {
          ...object,
          x: Math.max(FLOOR_MIN_X, Math.min(FLOOR_MAX_X - width, Math.round(Number(object.x) || FLOOR_MIN_X))),
          y: Math.max(FLOOR_MIN_Y, Math.min(FLOOR_MAX_Y - height, Math.round(Number(object.y) || FLOOR_MIN_Y))),
          width,
          height,
          rotation: ((Number(object.rotation) || 0) % 360 + 360) % 360,
          capacity: Math.max(0, Math.min(500, Number.parseInt(object.capacity ?? 0, 10) || 0)),
        };
      });
      const saved = await onSaveLayout?.({ branch, floor, objects: sanitizedObjects, publish: true });
      if (!saved) return;
      savedLayoutObjects.current = layoutObjects;
      setLayoutObjectsDirty(false);
      const savedPayload = typeof saved === 'object' && saved.data ? saved.data : saved;
      const published = Boolean(savedPayload?.published) || await onPublishLayout?.({ branch, floor });
      setLayoutHasDraft(Boolean(savedPayload?.hasDraft) && !published);
    } catch (error) {
      console.error('Could not save custom floor objects:', error);
    }
  };

  const publishDraft = async () => {
    try {
      const published = await onPublishLayout?.({ branch, floor });
      if (published) setLayoutHasDraft(false);
    } catch (error) {
      console.error('Could not publish custom floor objects:', error);
    }
  };

  const selectedLayoutObject = layoutObjects.find((object) => object.id === selectedLayoutObjectId);

  useEffect(() => {
    setCapacityInput(String(selectedLayoutObject?.capacity || 1));
  }, [selectedLayoutObjectId, selectedLayoutObject?.capacity]);

  useEffect(() => {
    if (!layoutEditable) return undefined;
    const handleLayoutKeyboard = (event) => {
      const target = event.target;
      const editingText = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventKeyDefault?.();
        event.preventDefault();
        if (event.shiftKey) redoLayout(); else undoLayout();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoLayout();
        return;
      }
      if (editingText) return;
      const selectedIds = selectedLayoutObjectIds.length ? selectedLayoutObjectIds : (selectedLayoutObjectId ? [selectedLayoutObjectId] : []);
      if (!selectedIds.length) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelectedFloorObject();
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const selected = new Set(selectedIds.map(String));
      commitLayoutObjects((current) => current.map((object) => {
        if (!selected.has(String(object.id))) return object;
        const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        return {
          ...object,
          x: Math.max(FLOOR_MIN_X, Math.min(FLOOR_MAX_X - Number(object.width || 0), Math.round((Number(object.x || 0) + deltaX) / (event.shiftKey ? 10 : 1)) * (event.shiftKey ? 10 : 1))),
          y: Math.max(FLOOR_MIN_Y, Math.min(FLOOR_MAX_Y - Number(object.height || 0), Math.round((Number(object.y || 0) + deltaY) / (event.shiftKey ? 10 : 1)) * (event.shiftKey ? 10 : 1))),
        };
      }));
    };
    window.addEventListener('keydown', handleLayoutKeyboard);
    return () => window.removeEventListener('keydown', handleLayoutKeyboard);
  }, [layoutEditable, selectedLayoutObjectId, selectedLayoutObjectIds, layoutObjects]);

  return (
    <section className={`konva-floor-plan ${bookingMode ? 'konva-booking-floor-plan' : ''} ${canvasFullWidth ? 'canvas-full-width' : ''}`} aria-label={`${branch} workspace floor plan`}>
    {!bookingMode && <label className="konva-floor-search">
      <FiSearch aria-hidden="true" />
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search rooms, desks, or workspace type"
        aria-label="Search floor plan"
      />
    </label>}

    <div className={`konva-floor-toolbar konva-floor-controls ${bookingMode ? 'konva-booking-floor-controls' : ''}`}>
      <div className="konva-map-selectors">
        {branchOptions.length > 1 && (
          <label className="konva-branch-select">
            <span>Branch</span>
            <select
              value={branch}
              disabled={layoutEditable}
              onChange={(event) => {
                setBranch(event.target.value);
                setFloor('Ground Floor');
                setStatusFilter('All');
                setLocalSelectedSpaceId(null);
              }}
            >
              {branchOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        <label className="konva-branch-select">
          <span>Floor</span>
          <select value={floor} disabled={layoutEditable} onChange={(event) => {
            setFloor(event.target.value);
            setStatusFilter('All');
            setLocalSelectedSpaceId(null);
          }}>
            {floorOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {!bookingMode && <label className="konva-branch-select konva-date-control">
          <span>Date</span>
          <div className="konva-date-input-wrap">
            <FiCalendar aria-hidden="true" />
            <input
              type="date"
              value={activeDate}
              disabled={bookingMode}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </label>}
      </div>
      {!bookingMode && <div className="konva-map-actions">
        <button className="konva-fit-button" type="button" onClick={() => setZoom(1)} aria-label="Fit floor plan to screen">
          <FiMonitor aria-hidden="true" />
          <span>Fit screen</span>
        </button>
        <div className="konva-zoom-control" aria-label="Canvas zoom">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.7, Number((value - 0.1).toFixed(1))))} aria-label="Zoom out">
            <FiMinus />
          </button>
          <div className="konva-zoom-value"><strong>{Math.round(zoom * 100)}%</strong><span>Screen</span></div>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))} aria-label="Zoom in">
            <FiPlus />
          </button>
        </div>
        <button type="button" onClick={toggleCanvasFullWidth} aria-label={canvasFullWidth ? 'Restore floor plan width' : 'Expand floor plan to full page width'}>
          {canvasFullWidth ? <FiMinimize2 /> : <FiMaximize2 />}
          <span>{canvasFullWidth ? 'Restore width' : 'Full width'}</span>
        </button>
      </div>}
    </div>

    <div className="konva-floor-toolbar konva-floor-statusbar">
      {layoutEditable && (
        <div className="konva-layout-editor" aria-label="Floor layout editor">
          <div className="konva-layout-editor-header">
            <div>
              <span className="konva-layout-kicker"><FiGrid /> NanoSpace Floor Studio</span>
              <strong>Architectural and furniture editor</strong>
            </div>
            <div className="konva-layout-history-controls">
              <button type="button" onClick={undoLayout} disabled={!layoutHistoryRef.current.length} title="Undo (Ctrl+Z)"><FiRotateCcw /><span>Undo</span></button>
              <button type="button" onClick={redoLayout} disabled={!layoutRedoRef.current.length} title="Redo (Ctrl+Y)"><FiRotateCw /><span>Redo</span></button>
              {selectedLayoutObject && <span className="konva-layout-selection-count">1 selected</span>}
            </div>
          </div>
          <div className="konva-layout-blank-note">
            <strong>Blank {floor}</strong>
            <span>Build this layout for {branch}. New elements start empty until you save and publish the floor.</span>
          </div>
          <div className="konva-layout-guided-maker">
            <div className="konva-layout-guided-title">
              <div><strong>Quick layout maker</strong><span>Tell us what your floor needs, then adjust it visually</span></div>
              <div className="konva-layout-guided-actions">
                <button type="button" onClick={resetQuickLayoutExample}>Use example</button>
                <button type="button" onClick={clearGeneratedLayout}>Clear layout</button>
                <button type="button" onClick={() => setShowAdvancedTools((current) => !current)}>{showAdvancedTools ? 'Hide advanced tools' : 'Add individual items'}</button>
              </div>
            </div>
            <div className="konva-layout-steps">
              {[1, 2, 3, 4].map((step) => <button key={step} type="button" className={quickMakerStep === step ? 'active' : ''} onClick={() => setQuickMakerStep(step)}><span>{step}</span>{['Cabins', 'Open areas', 'Rooms', 'Create'][step - 1]}</button>)}
            </div>
            {quickMakerStep === 1 && <div>
              <div className="konva-layout-step-heading"><strong>Private cabins</strong><span>Create different cabin types with any quantity and capacity.</span></div>
              <div className="konva-cabin-group-list">
                {cabinGroups.map((group, index) => (
                  <div className="konva-cabin-group" key={group.id}>
                    <div className="konva-cabin-group-index">{index + 1}</div>
                    <label>Cabin type<input type="text" value={group.name} placeholder="e.g. Executive cabins" onChange={(event) => updateCabinGroup(group.id, 'name', event.target.value)} /></label>
                    <label>How many?<input type="number" min="0" max="20" value={group.count} onChange={(event) => updateCabinGroup(group.id, 'count', event.target.value)} /></label>
                    <label>Seats in each<input type="number" min="1" max="500" value={group.seats} onChange={(event) => updateCabinGroup(group.id, 'seats', event.target.value)} /></label>
                    {cabinGroups.length > 1 && <button type="button" className="konva-cabin-remove" onClick={() => setCabinGroups((current) => current.filter((item) => item.id !== group.id))} aria-label={`Remove ${group.name}`}>Remove</button>}
                  </div>
                ))}
              </div>
              <button type="button" className="konva-cabin-add" onClick={addCabinGroup}>+ Add another cabin type</button>
            </div>}
            {quickMakerStep === 2 && <div>
              <div className="konva-layout-step-heading"><strong>Open working areas</strong><span>Define the number of shared desk areas and seats.</span></div>
              <div className="konva-layout-step-fields">
                <label>Open desk areas<input type="number" min="0" max="20" value={quickLayout.openCabinsCount} onChange={(event) => setQuickLayout((current) => ({ ...current, openCabinsCount: event.target.value }))} /><small>Number of areas to create</small></label>
                <label>Seats in each area<input type="number" min="1" max="500" value={quickLayout.openCabinSeats} onChange={(event) => setQuickLayout((current) => ({ ...current, openCabinSeats: event.target.value }))} /><small>Total seats represented</small></label>
              </div>
            </div>}
            {quickMakerStep === 3 && <div>
              <div className="konva-layout-step-heading"><strong>Meeting & facility rooms</strong><span>Enter quantities for the rooms available on this floor.</span></div>
              <div className="konva-layout-step-fields konva-layout-step-fields-wide">
                <label>Conference rooms<input type="number" min="0" max="20" value={quickLayout.conferenceCount} onChange={(event) => setQuickLayout((current) => ({ ...current, conferenceCount: event.target.value }))} /><small>Number of meeting rooms</small></label>
                <label>Seats per conference room<input type="number" min="1" max="500" value={quickLayout.conferenceSeats} onChange={(event) => setQuickLayout((current) => ({ ...current, conferenceSeats: event.target.value }))} /><small>Meeting room capacity</small></label>
                <label>Podcast rooms<input type="number" min="0" max="20" value={quickLayout.podcastRooms} onChange={(event) => setQuickLayout((current) => ({ ...current, podcastRooms: event.target.value }))} /><small>Number of recording rooms</small></label>
                <label>Cafeterias<input type="number" min="0" max="20" value={quickLayout.cafeterias} onChange={(event) => setQuickLayout((current) => ({ ...current, cafeterias: event.target.value }))} /><small>Food and break areas</small></label>
                <label>Toilets<input type="number" min="0" max="20" value={quickLayout.toilets} onChange={(event) => setQuickLayout((current) => ({ ...current, toilets: event.target.value }))} /><small>Restroom units</small></label>
              </div>
            </div>}
            {quickMakerStep === 4 && <div className="konva-layout-ready"><strong>Review your floor requirements</strong><span>Reception and outer walls are included automatically. You can move or resize every generated element afterwards.</span>
              <div className="konva-layout-requirement-summary">
                <span><b>{cabinGroups.reduce((total, group) => total + Math.max(0, Number(group.count) || 0), 0)}</b> private cabins across {cabinGroups.filter((group) => Number(group.count) > 0).length} types</span>
                <span><b>{Math.max(0, Number(quickLayout.openCabinsCount) || 0)}</b> open areas</span>
                <span><b>{Math.max(0, Number(quickLayout.conferenceCount) || 0)}</b> conference rooms</span>
                <span><b>{Math.max(0, Number(quickLayout.podcastRooms) || 0)}</b> podcast rooms</span>
                <span><b>{Math.max(0, Number(quickLayout.cafeterias) || 0)}</b> cafeterias</span>
                <span><b>{Math.max(0, Number(quickLayout.toilets) || 0)}</b> toilets</span>
              </div>
              <button type="button" onClick={autoCreateFloorLayout}>Create complete layout</button>
            </div>}
            <div className="konva-layout-step-actions"><button type="button" disabled={quickMakerStep === 1} onClick={() => setQuickMakerStep((step) => Math.max(1, step - 1))}>Back</button>{quickMakerStep < 4 && <button type="button" className="primary" onClick={() => setQuickMakerStep((step) => Math.min(4, step + 1))}>Next</button>}</div>
          </div>
          {showAdvancedTools && <div className="konva-layout-palette">
            <div className="konva-layout-category"><span>Structure</span><button type="button" onClick={() => addFloorObject('external_wall')}>+ External Wall</button><button type="button" onClick={() => addFloorObject('internal_wall')}>+ Internal Wall</button><button type="button" onClick={() => addFloorObject('glass_partition')}>+ Glass Partition</button><button type="button" onClick={() => addFloorObject('door')}>+ Door</button><button type="button" onClick={() => addFloorObject('corridor')}>+ Corridor</button></div>
            <div className="konva-layout-category"><span>Workspaces</span><button type="button" onClick={() => addFloorObject('private_cabin')}>+ Private Cabin</button><button type="button" onClick={() => addFloorObject('conference_room')}>+ Conference Room</button><button type="button" onClick={() => addFloorObject('open_desk')}>+ Open Desk Area</button><button type="button" onClick={() => addFloorObject('podcast_room')}>+ Podcast Room</button><button type="button" onClick={() => addFloorObject('desk')}>+ Desk</button><button type="button" onClick={() => addFloorObject('chair')}>+ Chair</button><button type="button" onClick={() => addFloorObject('reception_counter')}>+ Reception</button></div>
            <div className="konva-layout-category"><span>Facilities</span><button type="button" onClick={() => addFloorObject('bathroom')}>+ Bathroom</button><button type="button" onClick={() => addFloorObject('cafeteria')}>+ Cafeteria</button><button type="button" onClick={() => addFloorObject('pantry')}>+ Pantry</button><button type="button" onClick={() => addFloorObject('storage')}>+ Storage</button><button type="button" onClick={() => addFloorObject('lounge')}>+ Lounge</button></div>
            <div className="konva-layout-category"><span>Named areas · no seats</span><button type="button" onClick={() => addFloorObject('named_area')}>+ Room</button><button type="button" onClick={() => addFloorObject('named_area', 'TEMPLE')}>+ Temple</button><button type="button" onClick={() => addFloorObject('named_area', 'BALCONY')}>+ Balcony</button><button type="button" onClick={() => addFloorObject('named_area', 'OPEN AREA')}>+ Open Area</button></div>
          </div>}
          {selectedLayoutObject ? (
            <div className="konva-layout-inspector">
              <div className="konva-layout-inspector-title">
                <span><FiLayers /> Selected</span>
                <strong>{selectedLayoutObject.label || selectedLayoutObject.type.replaceAll('_', ' ')}</strong>
              </div>
              <label>Name<input value={selectedLayoutObject.label || ''} onChange={(event) => updateSelectedFloorObject({ label: event.target.value.slice(0, 40) })} /></label>
              <label>Width<input type="text" inputMode="numeric" pattern="[0-9]*" value={selectedLayoutObject.width} onChange={(event) => updateSelectedFloorObject({ width: Math.max(20, Math.min(600, Number(event.target.value.replace(/[^0-9]/g, '')) || 20)) })} /></label>
              <label>Height<input type="text" inputMode="numeric" pattern="[0-9]*" value={selectedLayoutObject.height} onChange={(event) => updateSelectedFloorObject({ height: Math.max(20, Math.min(600, Number(event.target.value.replace(/[^0-9]/g, '')) || 20)) })} /></label>
              {['cabin', 'private_cabin', 'conference_room', 'meeting_room', 'open_desk', 'desk', 'table'].includes(selectedLayoutObject.type) && (
                <label>
                  Seats
                  <span className="konva-capacity-stepper">
                    <button type="button" onClick={() => stepSelectedCapacity(-1)} aria-label="Decrease seats">−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={capacityInput}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                        setCapacityInput(digits);
                        if (digits) updateSelectedCapacity(digits);
                      }}
                      onBlur={() => updateSelectedCapacity(capacityInput || selectedLayoutObject.capacity || 1)}
                    />
                    <button type="button" onClick={() => stepSelectedCapacity(1)} aria-label="Increase seats">+</button>
                  </span>
                </label>
              )}
              <div className="konva-layout-transform-actions">
                <div className="konva-layout-align-actions">
                  <span>Align & straighten</span>
                  <button type="button" onClick={() => alignSelectedFloorObject('left')} aria-label="Align left">↤</button>
                  <button type="button" onClick={() => alignSelectedFloorObject('centerX')} aria-label="Align horizontal center">↔</button>
                  <button type="button" onClick={() => alignSelectedFloorObject('right')} aria-label="Align right">↦</button>
                  <button type="button" onClick={() => alignSelectedFloorObject('top')} aria-label="Align top">↥</button>
                  <button type="button" onClick={() => alignSelectedFloorObject('centerY')} aria-label="Align vertical center">↕</button>
                  <button type="button" onClick={() => alignSelectedFloorObject('bottom')} aria-label="Align bottom">↧</button>
                  <button type="button" onClick={() => rotateSelectedFloorObject(-90)} aria-label="Rotate left">⟲ 90°</button>
                  <button type="button" onClick={() => rotateSelectedFloorObject(90)} aria-label="Rotate right">⟳ 90°</button>
                  <button type="button" onClick={straightenSelectedFloorObject} aria-label="Straighten selected item">⊥ Straight</button>
                  <button type="button" className="konva-layout-snap" onClick={snapSelectedToGrid}>Snap to grid</button>
                </div>
                <button type="button" onClick={() => resizeSelectedFloorObject('width', -10)} aria-label="Make selected item narrower">W −</button>
                <button type="button" onClick={() => resizeSelectedFloorObject('width', 10)} aria-label="Make selected item wider">W +</button>
                <button type="button" onClick={() => resizeSelectedFloorObject('height', -10)} aria-label="Make selected item shorter">H −</button>
                <button type="button" onClick={() => resizeSelectedFloorObject('height', 10)} aria-label="Make selected item taller">H +</button>
                <button type="button" className="konva-layout-copy" onClick={duplicateSelectedFloorObject}><FiCopy /> Duplicate</button>
                <button type="button" className="konva-layout-remove" onClick={removeSelectedFloorObject}><FiTrash2 /> Delete</button>
              </div>
            </div>
          ) : (
            <div className="konva-layout-editor-tip">Drag elements to arrange the floor plan. Select an element to resize, rotate, duplicate or delete it.</div>
          )}
        </div>
      )}
      {!layoutEditable && !adminLayout && !bookingMode && <div className="konva-status-filters" role="group" aria-label="Filter workspaces by status">
          {['All', 'Available', 'Occupied', 'Booked'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`konva-status-chip ${statusFilter === status ? 'active' : ''} ${status.toLowerCase()}`}
              aria-pressed={statusFilter === status}
            >
              <span>{status}</span>
              <strong>{status === 'All' ? bookingSpaces.length : counts[status]}</strong>
            </button>
          ))}
        </div>}
      </div>

      {isLoadingAvailability && !adminLayout ? (
        <div className="konva-floor-empty">Loading availability for {branch}…</div>
      ) : filteredSpaces.length || layoutEditable || adminLayout || layoutObjects.length ? (
        <div className={`konva-floor-workspace ${adminLayout || layoutEditable || bookingMode ? 'konva-floor-workspace-layout-only' : ''}`}>
          <div className={`konva-floor-map-panel ${canvasFullWidth ? 'canvas-expanded' : ''}`}>
          <KonvaFloorCanvas
            spaces={filteredSpaces}
            branch={branch}
            floor={floor}
            zoom={zoom}
            requestedSeatCount={requestedSeatCount}
            selectedSpaceId={activeSelectedSpace?.dbId || activeSelectedSpace?.id}
            bookingMode={bookingMode}
            layoutEditable={layoutEditable}
            layoutOnly={adminLayout || layoutEditable || layoutObjects.length > 0}
            layoutObjects={layoutObjects}
            selectedLayoutObjectId={selectedLayoutObjectId}
            selectedLayoutObjectIds={selectedLayoutObjectIds}
            bookingCategory={bookingCategory}
            onSelectSpace={selectSpace}
            onLayoutChange={onLayoutChange}
            onLayoutObjectMove={moveFloorObject}
            onLayoutObjectResize={resizeFloorObject}
            onSelectLayoutObject={(id, additive) => selectLayoutObject(id, additive)}
          />
          </div>
          {!adminLayout && !layoutEditable && !bookingMode && <aside className="konva-space-details" aria-live="polite">
            {activeSelectedSpace ? (
              <>
                <div className={`konva-space-detail-illustration ${activeSelectedSpace.type.toLowerCase()}`}>
                  <span>{activeSelectedSpace.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="konva-space-detail-body">
                  <span className="konva-space-detail-kicker">WORKSPACE DETAILS</span>
                  <h3>{activeSelectedSpace.name}</h3>
                  <p>{activeSelectedSpace.code} · {activeSelectedSpace.floor}</p>
                  <span className={`konva-space-detail-status ${activeSelectedSpace.status.toLowerCase()}`}>
                    {activeSelectedSpace.status}
                  </span>
                  <div className="konva-space-detail-capacity">
                    <span>Capacity</span>
                    <strong>{activeSelectedSpace.availableCapacity} / {activeSelectedSpace.capacity} seats available</strong>
                  </div>
                  <div className="konva-space-detail-amenities">
                    <strong>Workspace features</strong>
                    <div>
                      {['Wi-Fi', 'Power', activeSelectedSpace.type.includes('CONFERENCE') ? 'Display' : 'Ergonomic desk'].map((feature) => (
                        <span key={feature}>{feature}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="konva-space-book-button"
                    disabled={layoutEditable || (bookingMode && (
                      activeSelectedSpace.status !== 'Available' ||
                      activeSelectedSpace.availableCapacity < requestedSeatCount
                    ))}
                    onClick={() => showSpaceDetails(activeSelectedSpace)}
                  >
                    {layoutEditable ? 'Finish editing to select' : bookingMode ? 'Book this room' : 'Select workspace'}
                  </button>
                </div>
              </>
            ) : (
              <div className="konva-space-detail-empty">Select a workspace to view its details.</div>
            )}
          </aside>}
        </div>
      ) : bookingMode ? null : (
        <div className="konva-floor-empty">
          {bookingSpaces.length && searchQuery.trim()
                ? `No workspaces match "${searchQuery.trim()}".`
            : hasApiRecords
            ? `No workspaces are configured for ${branch} yet.`
            : `No visual floor plan is configured for ${branch}.`}
        </div>
      )}
      {bookingMode && bookingSpaces.length === 0 && (
        <div className="konva-booking-empty" role="status">
          <div>
            <strong>No {String(bookingCategory || 'matching').replace(/_/g, ' ')} rooms available on this floor</strong>
            <span>Try another floor, or ask a branch administrator to add this room as a workspace and save &amp; publish the floor layout.</span>
          </div>
          {onChangeBookingType && (
            <button type="button" onClick={onChangeBookingType}>Choose another workspace type</button>
          )}
        </div>
      )}
      {bookingMode && bookingSpaces.length > 0 && (
        <div className="konva-booking-space-list" aria-label="Choose an available workspace">
          <div className="konva-booking-space-list-heading">
            <div>
              <strong>Available spaces</strong>
              <span>Tap a space on the plan or choose it here. Options show seats free.</span>
            </div>
            <div className="konva-booking-space-list-counts">
              <span className="available">{bookingSpaces.filter((space) => space.status === 'Available' && Number(space.availableCapacity || 0) >= requestedSeatCount).length} available</span>
              <span className="unavailable">{bookingSpaces.filter((space) => space.status !== 'Available' || Number(space.availableCapacity || 0) < requestedSeatCount).length} unavailable</span>
            </div>
          </div>
          <div className="konva-booking-space-list-grid konva-booking-space-tabs" role="group" aria-label="Available cabins and spaces">
            {bookingSpaces.map((space) => {
              const selectable = space.status === 'Available' && Number(space.availableCapacity || 0) >= requestedSeatCount;
              const selected = [space.id, space.dbId, space.code].some((id) => String(id || '') === String(selectedSeat || localSelectedSpaceId || ''));
              return (
                <button
                  type="button"
                  key={`${space.dbId || space.id}-${space.code || space.name}`}
                  className={`konva-booking-space-option ${selectable ? 'available' : 'unavailable'} ${selected ? 'selected' : ''}`}
                  disabled={!selectable}
                  aria-pressed={selected}
                  onClick={() => selectSpace(space)}
                >
                  <span className="konva-booking-space-option-copy">
                    <strong>{space.code || space.name}</strong>
                    <small>{space.name !== space.code ? space.name : space.type.replace(/_/g, ' ')} · {requestedSeatCount} requested</small>
                  </span>
                  <span className="konva-booking-space-option-status">
                    {selectable ? `${space.availableCapacity} free` : space.status !== 'Available' ? space.status : `Only ${space.availableCapacity} free`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {matchingCurrentAvailability?.error && (
        <div className="konva-floor-note" role="alert">{matchingCurrentAvailability.error}</div>
      )}
      {layoutLoadError && <div className="konva-floor-note" role="alert">{layoutLoadError}</div>}
      {!bookingMode && <div className="konva-floor-footer">
        {!adminLayout && (
          <div className="konva-floor-legend">
            <span><i className="available" />Available</span>
            <span><i className="occupied" />Occupied</span>
            <span><i className="booked" />Booked</span>
          </div>
        )}
        <div className="d-flex align-items-center gap-3">
          {layoutEditable && (
            <button
              type="button"
              className="konva-publish-layout-button"
              disabled={publishingLayout || (!layoutObjectsDirty && !Object.keys(layoutOverrides).length)}
              onClick={saveDraft}
            >
              {publishingLayout ? 'Saving & publishing...' : 'Save & publish layout'}
            </button>
          )}
        </div>
      </div>}
    </section>
  );
}
