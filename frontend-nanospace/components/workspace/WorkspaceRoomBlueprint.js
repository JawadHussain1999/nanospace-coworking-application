import React from 'react';
import { FiMonitor, FiMic, FiShield, FiUsers, FiCpu, FiRadio, FiCheck } from 'react-icons/fi';

/**
 * Interactive visual architectural blueprint for workspace spaces:
 * - Private Cabins (5, 10, 20 seats)
 * - Conference Rooms (10-seater boardroom table with 4K screen)
 * - Podcast Studio (Acoustic-treated booth with broadcast mics & ON-AIR sign)
 * - Open Desk clusters
 */
export default function WorkspaceRoomBlueprint({
  type = 'private_cabin',
  capacity = 10,
  status = 'Available',
  compact = false,
  interactive = true,
  onSeatClick = null
}) {
  const cap = Math.max(1, Math.min(50, Number(capacity) || 1));
  const isOccupied = status === 'Occupied';

  // Render Conference Room Boardroom Table Layout
  if (type === 'conference_room') {
    // Generate perimeter seats around a central conference table
    const seats = Array.from({ length: cap }, (_, i) => ({
      index: i + 1,
      label: i === 0 ? 'Lead Chair' : `Delegate ${i + 1}`,
      isLeader: i === 0
    }));

    return (
      <div className={`arch-blueprint-box conf-blueprint ${compact ? 'compact' : ''}`}>
        {/* AV Screen at top of room */}
        <div className="blueprint-av-wall">
          <div className="av-screen-badge">
            <FiMonitor className="me-1" />
            <span>4K Presentation Screen</span>
          </div>
        </div>

        {/* Boardroom Table surrounded by seats */}
        <div className="blueprint-table-zone">
          <div className="conf-table-surface">
            <div className="table-center-hub">
              <span className="hub-dot" />
              <small>CONFERENCE HUB</small>
            </div>

            {/* Perimeter Seats */}
            <div className="conf-seats-ring">
              {seats.map((seat) => (
                <button
                  key={seat.index}
                  type="button"
                  className={`blueprint-seat-dot ${isOccupied ? 'seat-occupied' : 'seat-vacant'} ${seat.isLeader ? 'leader-seat' : ''}`}
                  title={`${seat.label} · ${isOccupied ? 'Occupied' : 'Available'}`}
                  onClick={() => interactive && onSeatClick?.(seat.index)}
                >
                  <span className="seat-num">{seat.index}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="blueprint-doorway">
          <span>ENTRANCE · SOUNDPROOF GLASS</span>
        </div>
      </div>
    );
  }

  // Render Podcast Studio Acoustic Booth
  if (type === 'podcast_room') {
    const seats = Array.from({ length: cap }, (_, i) => ({
      index: i + 1,
      label: i === 0 ? 'Host & Console' : `Guest ${i + 1}`,
      isHost: i === 0
    }));

    return (
      <div className={`arch-blueprint-box podcast-blueprint ${compact ? 'compact' : ''}`}>
        {/* On Air Neon Banner */}
        <div className="podcast-on-air-bar">
          <span className="on-air-pill">
            <FiRadio className="pulse-mic me-1" /> ON AIR
          </span>
          <span className="acoustic-rating">48dB ISOLATION</span>
        </div>

        {/* Acoustic round recording desk */}
        <div className="podcast-studio-core">
          <div className="acoustic-wall-left" title="Acoustic Wedge Diffuser" />
          <div className="podcast-round-table">
            <div className="console-indicator">
              <FiCpu className="me-1" />
              <span>RODECASTER</span>
            </div>

            <div className="podcast-mic-seats">
              {seats.map((seat) => (
                <button
                  key={seat.index}
                  type="button"
                  className={`blueprint-podcast-mic-seat ${isOccupied ? 'seat-occupied' : 'seat-vacant'} ${seat.isHost ? 'host-mic' : ''}`}
                  title={`${seat.label} · Shure SM7B Mic`}
                  onClick={() => interactive && onSeatClick?.(seat.index)}
                >
                  <FiMic className="mic-icon" />
                  <span className="seat-tag">{seat.isHost ? 'HOST' : `G${seat.index}`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="acoustic-wall-right" title="Acoustic Wedge Diffuser" />
        </div>

        <div className="blueprint-doorway podcast-door">
          <span>DOUBLE ACOUSTIC AIRLOCK</span>
        </div>
      </div>
    );
  }

  // Render Private Cabin (5, 10, 20 seats layout)
  // Top: Executive / Manager desk
  // Bottom: Grid of employee workstation desks
  const teamSeatsCount = Math.max(0, cap - 1);
  const teamSeats = Array.from({ length: teamSeatsCount }, (_, i) => ({
    index: i + 2,
    label: `Workstation ${i + 1}`
  }));

  // Determine grid columns based on team seats
  const gridColsClass = cap > 15 ? 'cols-5' : cap > 8 ? 'cols-4' : 'cols-2';

  return (
    <div className={`arch-blueprint-box cabin-blueprint ${compact ? 'compact' : ''}`}>
      {/* Top section: Manager / Lead workstation */}
      <div className="cabin-lead-zone">
        <div className="cabin-lead-desk">
          <div className="desk-surface">
            <span className="desk-tag">MANAGER DESK</span>
          </div>
          <button
            type="button"
            className={`blueprint-seat-dot leader-seat ${isOccupied ? 'seat-occupied' : 'seat-vacant'}`}
            title={`Lead Seat #1 · ${isOccupied ? 'Occupied' : 'Available'}`}
            onClick={() => interactive && onSeatClick?.(1)}
          >
            <span className="seat-num">1</span>
          </button>
        </div>
      </div>

      {/* Team Pods Grid */}
      {teamSeatsCount > 0 && (
        <div className={`cabin-team-grid ${gridColsClass}`}>
          {teamSeats.map((seat) => (
            <div key={seat.index} className="team-workstation-unit">
              <div className="mini-desk-line" />
              <button
                type="button"
                className={`blueprint-seat-dot ${isOccupied ? 'seat-occupied' : 'seat-vacant'}`}
                title={`Seat #${seat.index} · ${isOccupied ? 'Occupied' : 'Available'}`}
                onClick={() => interactive && onSeatClick?.(seat.index)}
              >
                <span className="seat-num">{seat.index}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Cabin Doorway */}
      <div className="blueprint-doorway">
        <span className="door-tag"><FiShield className="me-1" />RFID LOCK · KEYCARD ACCESS</span>
      </div>
    </div>
  );
}
