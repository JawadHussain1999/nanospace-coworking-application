import { useEffect, useMemo, useRef, useState } from 'react';
import { Arc, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';

const CANVAS_WIDTH = 1320;
const CANVAS_HEIGHT = 780;
const FLOOR_MIN_X = 36;
const FLOOR_MIN_Y = 86;
const FLOOR_MAX_X = 1284;
const FLOOR_MAX_Y = 744;
const clampFloorX = (x, width) => Math.max(FLOOR_MIN_X, Math.min(FLOOR_MAX_X - width, x));
const clampFloorY = (y, height) => Math.max(FLOOR_MIN_Y, Math.min(FLOOR_MAX_Y - height, y));

const STATUS_STYLE = {
  Available: { room: '#ffffff', wall: '#738194', seat: '#22c55e', accent: '#15803d' },
  Occupied: { room: '#ffffff', wall: '#738194', seat: '#ef4444', accent: '#b91c1c' },
  Booked: { room: '#ffffff', wall: '#738194', seat: '#ef4444', accent: '#b91c1c' },
};

function SeatMarker({ x, y, available, color, index }) {
  const fill = available ? color : '#a9b2bf';
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={8} fill="#ffffff" stroke="#718096" strokeWidth={1.5} />
      <Circle radius={5.5} fill={fill} />
      <Text
        x={-15}
        y={9}
        width={30}
        align="center"
        text={String(index + 1)}
        fontFamily="Arial"
        fontSize={7}
        fill="#778397"
      />
    </Group>
  );
}

function DeskPod({ x, y, width, height, available, color, index }) {
  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        cornerRadius={2}
        fill="#e9edf1"
        stroke="#adb7c2"
        strokeWidth={1}
      />
      <Line points={[-width / 2 + 3, 0, width / 2 - 3, 0]} stroke="#c5ccd4" strokeWidth={1} />
      <SeatMarker x={0} y={-height / 2 - 9} available={available} color={color} index={index} />
      <SeatMarker x={0} y={height / 2 + 9} available={available} color={color} index={index} />
    </Group>
  );
}

function RoomFurniture({ space, width, height, color }) {
  const capacity = Math.max(1, Number(space.capacity) || 1);
  const availableCapacity = Math.max(0, Math.min(capacity, Number(space.availableCapacity ?? capacity)));
  const isConference = space.type.includes('CONFERENCE');
  const isOpenDesk = ['HOT_DESK', 'OPEN_DESK', 'HOTDESK'].includes(space.type);

  if (isConference) {
    const tableWidth = Math.min(width * 0.62, 190);
    const tableHeight = Math.min(42, height * 0.25);
    const sideSeats = Math.ceil((capacity - 2) / 2);
    const spacing = tableWidth / Math.max(sideSeats, 1);
    return (
      <Group listening={false}>
        <Rect
          x={(width - tableWidth) / 2}
          y={(height - tableHeight) / 2}
          width={tableWidth}
          height={tableHeight}
          cornerRadius={8}
          fill="#d9e7ee"
          stroke="#8095a3"
          strokeWidth={1.5}
        />
        <Circle x={width / 2} y={height / 2} radius={4} fill="#8ca7b4" />
        {Array.from({ length: capacity }, (_, index) => {
          const isTop = index < sideSeats;
          const sideIndex = isTop ? index : index - sideSeats;
          const seatX = width / 2 - tableWidth / 2 + spacing * (sideIndex + 0.5);
          const isEndSeat = index >= sideSeats * 2;
          const endX = index === sideSeats * 2 ? width / 2 - tableWidth / 2 - 13 : width / 2 + tableWidth / 2 + 13;
          const x = isEndSeat ? endX : seatX;
          const y = isEndSeat
            ? height / 2
            : isTop
              ? height / 2 - tableHeight / 2 - 12
              : height / 2 + tableHeight / 2 + 12;
          return (
            <SeatMarker
              key={`conference-seat-${index}`}
              x={x}
              y={y}
              available={index < availableCapacity}
              color={color}
              index={index}
            />
          );
        })}
        <Text
          x={width / 2 - tableWidth / 2}
          y={height / 2 - 5}
          width={tableWidth}
          align="center"
          text="MEETING TABLE"
          fontFamily="Arial"
          fontSize={8}
          fontStyle="bold"
          fill="#64748b"
        />
      </Group>
    );
  }

  const columns = isOpenDesk
    ? Math.max(1, Math.ceil(Math.sqrt(capacity * 1.5)))
    : Math.min(5, Math.max(2, Math.ceil(Math.sqrt(capacity))));
  const rows = Math.ceil(capacity / columns);
  const gapX = Math.min(50, (width - 34) / columns);
  const gapY = Math.min(54, (height - 72) / rows);
  const deskWidth = Math.max(22, Math.min(isOpenDesk ? 42 : 46, gapX - 7));
  const deskHeight = Math.max(16, Math.min(29, gapY - 13));
  const firstX = (width - gapX * (columns - 1)) / 2;
  const firstY = 54 + Math.max(0, (height - 72 - gapY * (rows - 1)) / 2);

  return (
    <Group listening={false}>
      {Array.from({ length: capacity }, (_, index) => (
        <DeskPod
          key={`desk-${index}`}
          x={firstX + (index % columns) * gapX}
          y={firstY + Math.floor(index / columns) * gapY}
          width={deskWidth}
          height={deskHeight}
          available={index < availableCapacity}
          color={color}
          index={index}
        />
      ))}
    </Group>
  );
}

function FloorObject({ object, editable, selected, transformable = selected, objects = [], bookingSpace, bookingMode, bookingCategory, onSpaceSelect, onMove, onResize, onSelect, onAlignmentGuide }) {
  const objectRef = useRef(null);
  const transformerRef = useRef(null);
  useEffect(() => {
    if (!transformable || !editable || !transformerRef.current || !objectRef.current) return;
    transformerRef.current.nodes([objectRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [transformable, editable, object.id, object.width, object.height, object.rotation]);
  const isCabin = ['cabin', 'private_cabin'].includes(object.type);
  const roomFills = {
    private_cabin: '#ece7dc', conference_room: '#e9e6dc', meeting_room: '#e9e6dc', open_desk: '#ece9df',
    named_area: '#e8eef5',
    bathroom: '#e7edea', podcast_room: '#e2e8f0', cafeteria: '#ede5d8', reception: '#e9e7e2', pantry: '#eee9dd',
    corridor: '#e8e5dc', lift: '#dfe2df', stairs: '#dfe2df', storage: '#eceae4', lounge: '#ebe7df',
    external_wall: '#646a67', internal_wall: '#747b77', glass_partition: '#dcecf2'
  };
  const bookingStatus = bookingSpace?.status;
  const canBookSpace = bookingSpace && isWorkspaceInBookingCategory(bookingSpace, bookingCategory);
  const fill = bookingSpace
    ? bookingStatus === 'Available' ? '#dcfce7' : '#fee2e2'
    : ['wall', 'external_wall', 'internal_wall'].includes(object.type)
      ? '#646a67'
      : roomFills[object.type] || (object.type === 'chair' ? '#b9c1be' : isCabin ? '#ece7dc' : '#dce0dc');
  const stroke = selected ? '#2563eb' : bookingSpace?.status === 'Available' ? '#16a34a' : bookingSpace ? '#dc2626' : object.type === 'wall' ? '#515753' : '#9b9b91';
  return (
    <>
    <Group
      ref={objectRef}
      name="floor-object"
      x={object.x}
      y={object.y}
      rotation={object.rotation || 0}
      draggable={editable}
      listening={editable || Boolean(canBookSpace && bookingMode)}
      onClick={(event) => {
        event.cancelBubble = true;
        if (editable) onSelect(object.id, event.evt?.shiftKey || event.evt?.ctrlKey || event.evt?.metaKey);
        else if (canBookSpace && bookingMode) onSpaceSelect?.(bookingSpace);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        if (editable) onSelect(object.id);
        else if (canBookSpace && bookingMode) onSpaceSelect?.(bookingSpace);
      }}
      onDragStart={(event) => {
        const additive = event.evt?.shiftKey || event.evt?.ctrlKey || event.evt?.metaKey;
        onSelect(object.id, additive);
      }}
      onDragMove={(event) => {
        if (!editable || !onAlignmentGuide) return;
        const threshold = 4;
        const movingWidth = Number(object.width) || 0;
        const movingHeight = Number(object.height) || 0;
        const current = {
          x: clampFloorX(event.target.x(), movingWidth),
          y: clampFloorY(event.target.y(), movingHeight),
        };
        let nextX = current.x;
        let nextY = current.y;
        let guideX = null;
        let guideY = null;
        const xEdges = [
          { value: current.x, edge: 'left' },
          { value: current.x + movingWidth / 2, edge: 'center' },
          { value: current.x + movingWidth, edge: 'right' },
        ];
        const yEdges = [
          { value: current.y, edge: 'top' },
          { value: current.y + movingHeight / 2, edge: 'center' },
          { value: current.y + movingHeight, edge: 'bottom' },
        ];
        let nearestX = threshold + 1;
        let nearestY = threshold + 1;
        objects.forEach((other) => {
          if (String(other.id) === String(object.id)) return;
          const otherWidth = Number(other.width) || 0;
          const otherHeight = Number(other.height) || 0;
          const staticX = [Number(other.x) || 0, (Number(other.x) || 0) + otherWidth / 2, (Number(other.x) || 0) + otherWidth];
          const staticY = [Number(other.y) || 0, (Number(other.y) || 0) + otherHeight / 2, (Number(other.y) || 0) + otherHeight];
          xEdges.forEach((moving, movingIndex) => {
            staticX.forEach((target) => {
              const difference = Math.abs(moving.value - target);
              if (difference < nearestX && difference <= threshold) {
                nearestX = difference;
                const offset = movingIndex === 0 ? 0 : movingIndex === 1 ? movingWidth / 2 : movingWidth;
                nextX = target - offset;
                guideX = target;
              }
            });
          });
          yEdges.forEach((moving, movingIndex) => {
            staticY.forEach((target) => {
              const difference = Math.abs(moving.value - target);
              if (difference < nearestY && difference <= threshold) {
                nearestY = difference;
                const offset = movingIndex === 0 ? 0 : movingIndex === 1 ? movingHeight / 2 : movingHeight;
                nextY = target - offset;
                guideY = target;
              }
            });
          });
        });
        nextX = clampFloorX(nextX, movingWidth);
        nextY = clampFloorY(nextY, movingHeight);
        event.target.position({ x: nextX, y: nextY });
        onAlignmentGuide({ x: guideX, y: guideY });
      }}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = Number(node.scaleX()) || 1;
        const scaleY = Number(node.scaleY()) || 1;
        const nextWidth = Math.max(20, Math.min(600, Math.round(Number(object.width) * scaleX)));
        const nextHeight = Math.max(20, Math.min(600, Math.round(Number(object.height) * scaleY)));
        const nextX = clampFloorX(Math.round(node.x()), nextWidth);
        const nextY = clampFloorY(Math.round(node.y()), nextHeight);
        node.scaleX(1);
        node.scaleY(1);
        node.position({ x: nextX, y: nextY });
        node.getLayer()?.batchDraw();
        onResize?.(object.id, nextWidth, nextHeight, nextX, nextY);
      }}
      onDragEnd={(event) => {
        if (onAlignmentGuide) onAlignmentGuide({ x: null, y: null });
        const x = clampFloorX(event.target.x(), Number(object.width) || 0);
        const y = clampFloorY(event.target.y(), Number(object.height) || 0);
        event.target.position({ x, y });
        onMove(object.id, x, y);
      }}
      onMouseEnter={(event) => {
        if (editable) event.target.getStage().container().style.cursor = 'move';
        else if (canBookSpace) event.target.getStage().container().style.cursor = bookingSpace.status === 'Available' ? 'pointer' : 'not-allowed';
      }}
      onMouseLeave={(event) => {
        event.target.getStage().container().style.cursor = 'default';
      }}
    >
      <Rect
        width={object.width}
        height={object.height}
        cornerRadius={object.type === 'chair' ? object.width / 2 : object.type === 'wall' ? 0 : 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 3 : object.type === 'wall' ? 7 : 1.25}
        dash={undefined}
        shadowColor="#5f625d"
        shadowBlur={selected ? 9 : 4}
        shadowOpacity={0.18}
        shadowOffsetY={object.type === 'wall' ? 0 : 2}
      />
      {object.type === 'named_area' && (
        <Rect
          x={8}
          y={8}
          width={Math.max(4, object.width - 16)}
          height={Math.max(4, object.height - 16)}
          cornerRadius={5}
          fill="#ffffff"
          opacity={0.35}
          stroke="#94a3b8"
          dash={[5, 4]}
          listening={false}
        />
      )}
      {object.type === 'desk' && (
        <>
          <Rect x={6} y={6} width={object.width - 12} height={object.height - 12} cornerRadius={3} fill="#d8dcd8" stroke="#909992" strokeWidth={1} listening={false} />
          <Line points={[object.width / 2, 10, object.width / 2, object.height - 10]} stroke="#aab1ad" strokeWidth={1} listening={false} />
          <Rect x={object.width / 2 - 12} y={object.height + 2} width={24} height={9} cornerRadius={4} fill="#bfc5c1" stroke="#818985" listening={false} />
        </>
      )}
      {(object.type === 'chair' || object.type === 'table') && (
        <>
          <Rect x={object.width * 0.22} y={object.height * 0.14} width={object.width * 0.56} height={object.height * 0.52} cornerRadius={5} fill="#bdc7bf" stroke="#78827d" strokeWidth={1} listening={false} />
          <Rect x={object.width * 0.08} y={object.height * 0.58} width={object.width * 0.84} height={object.height * 0.13} cornerRadius={3} fill="#cbd0cc" stroke="#78827d" strokeWidth={1} listening={false} />
          {object.type === 'table' && Array.from({ length: Math.max(0, Number(object.capacity) || 4) }, (_, index) => {
            const side = index % 2 === 0 ? -1 : 1;
            const position = Math.floor(index / 2);
            const count = Math.ceil((Number(object.capacity) || 4) / 2);
            const x = object.width / 2 - ((count - 1) * object.width * 0.7) / count / 2 + position * (object.width * 0.7 / count);
            const y = side < 0 ? object.height + 9 : -9;
            return <Rect key={`table-chair-${index}`} x={x - 10} y={y} width={20} height={12} cornerRadius={4} fill="#bdc5bf" stroke="#818985" listening={false} />;
          })}
        </>
      )}
      {object.type === 'glass_partition' && (
        <>
          <Line points={[0, object.height / 2, object.width, object.height / 2]} stroke="#91c4d8" strokeWidth={2} listening={false} />
          {Array.from({ length: Math.max(1, Math.floor(object.width / 55)) }, (_, index) => (
            <Line key={`glass-post-${index}`} points={[8 + index * 55, 1, 8 + index * 55, object.height - 1]} stroke="#5f9ab3" strokeWidth={1} listening={false} />
          ))}
        </>
      )}
      {object.type === 'plant' && (
        <>
          <Circle x={object.width / 2} y={object.height / 2} radius={object.width * 0.38} fill="#d4b596" stroke="#8a755d" strokeWidth={1} listening={false} />
          {[0, 72, 144, 216, 288].map((angle) => (
            <Ellipse key={angle} x={object.width / 2 + Math.cos(angle * Math.PI / 180) * object.width * 0.2} y={object.height / 2 + Math.sin(angle * Math.PI / 180) * object.height * 0.2} radiusX={object.width * 0.13} radiusY={object.height * 0.08} rotation={angle} fill="#6f9b74" listening={false} />
          ))}
        </>
      )}
      {object.type === 'sofa' && (
        <>
          <Rect x={6} y={8} width={object.width - 12} height={object.height - 16} cornerRadius={10} fill="#9fb4b0" stroke="#687d79" listening={false} />
          <Line points={[object.width / 3, 8, object.width / 3, object.height - 8]} stroke="#748985" listening={false} />
          <Line points={[object.width * 2 / 3, 8, object.width * 2 / 3, object.height - 8]} stroke="#748985" listening={false} />
        </>
      )}
      {object.type === 'reception_counter' && (
        <>
          <Rect x={4} y={5} width={object.width - 8} height={object.height - 10} cornerRadius={5} fill="#d8bf9b" stroke="#947a5a" listening={false} />
          <Rect x={object.width * 0.18} y={object.height * 0.18} width={object.width * 0.64} height={object.height * 0.22} fill="#ebe3d7" stroke="#9d8d78" listening={false} />
        </>
      )}
      {object.type === 'bathroom' && (
        <>
          {[0.22, 0.52, 0.82].map((xRatio) => (
            <Group key={xRatio} x={object.width * xRatio} y={object.height * 0.48} listening={false}>
              <Rect x={-16} y={-20} width={32} height={40} cornerRadius={5} fill="#e7ebe8" stroke="#7d8983" strokeWidth={1} />
              <Ellipse x={0} y={-5} radiusX={10} radiusY={13} fill="#fafaf7" stroke="#8d9691" strokeWidth={1} />
              <Rect x={-9} y={14} width={18} height={8} cornerRadius={2} fill="#f7f7f3" stroke="#8d9691" />
            </Group>
          ))}
        </>
      )}
      {object.type === 'cafeteria' && (
        <>
          {[0.28, 0.72].map((xRatio) => (
            <Group key={xRatio} x={object.width * xRatio} y={object.height / 2} listening={false}>
              <Rect x={-34} y={-20} width={68} height={40} cornerRadius={8} fill="#fde68a" stroke="#a16207" />
              <Circle x={-44} y={0} radius={7} fill="#22c55e" />
              <Circle x={44} y={0} radius={7} fill="#22c55e" />
            </Group>
          ))}
        </>
      )}
      {object.type === 'reception' && (
        <Rect x={object.width * 0.12} y={object.height * 0.55} width={object.width * 0.76} height={object.height * 0.24} cornerRadius={6} fill="#ddd6fe" stroke="#7c3aed" />
      )}
      {object.type === 'door' && (
        <>
          <Line points={[4, object.height - 4, object.height - 4, object.height - 4]} stroke="#475569" strokeWidth={4} />
          <Arc x={4} y={object.height - 4} innerRadius={object.height - 8} outerRadius={object.height - 4} angle={90} rotation={0} stroke="#475569" strokeWidth={2} />
        </>
      )}
      {object.type === 'stairs' && Array.from({ length: 7 }, (_, index) => (
        <Line key={index} points={[18, 28 + index * (object.height - 56) / 7, object.width - 18, 28 + index * (object.height - 56) / 7]} stroke="#94a3b8" strokeWidth={2} />
      ))}
      {['conference_room', 'meeting_room'].includes(object.type) && (() => {
        const capacity = Math.max(1, Number(object.capacity) || 6);
        const topCount = Math.ceil(capacity / 2);
        const bottomCount = capacity - topCount;
        const tableX = object.width * 0.24;
        const tableWidth = object.width * 0.52;
        const tableY = object.height * 0.38;
        const tableHeight = object.height * 0.24;
        const seatXs = (count) => Array.from({ length: count }, (_, index) => object.width / 2 - (count - 1) * tableWidth / (Math.max(1, count) * 2) + index * tableWidth / Math.max(1, count));
        return (
          <>
            <Rect x={tableX} y={tableY} width={tableWidth} height={tableHeight} cornerRadius={10} fill="#d8dcd8" stroke="#7e8983" strokeWidth={1.5} listening={false} />
            {seatXs(topCount).map((x, index) => <Rect key={`meeting-top-${index}`} x={x - 13} y={object.height * 0.24} width={26} height={17} cornerRadius={4} fill="#c4cbc6" stroke="#818985" listening={false} />)}
            {seatXs(bottomCount).map((x, index) => <Rect key={`meeting-bottom-${index}`} x={x - 13} y={object.height * 0.62} width={26} height={17} cornerRadius={4} fill="#c4cbc6" stroke="#818985" listening={false} />)}
          </>
        );
      })()}
      {object.type === 'private_cabin' && (() => {
        const capacity = Math.max(1, Number(object.capacity) || 4);
        const columns = capacity > 6 ? 5 : capacity > 3 ? 3 : 2;
        const rows = Math.ceil(capacity / columns);
        const podWidth = Math.min(58, (object.width - 48) / columns);
        const podHeight = Math.min(62, (object.height - 42) / rows);
        return Array.from({ length: capacity }, (_, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          const rowCount = Math.min(columns, capacity - row * columns);
          const rowOffset = (object.width - rowCount * podWidth) / 2;
          const x = rowOffset + column * podWidth + podWidth / 2;
          const y = (object.height - rows * podHeight) / 2 + row * podHeight + podHeight / 2;
          return (
            <Group key={`cabin-seat-${index}`} x={x} y={y} listening={false}>
              <Rect x={-podWidth * 0.42} y={-podHeight * 0.32} width={podWidth * 0.84} height={podHeight * 0.64} cornerRadius={3} fill="#d9bc91" stroke="#8f7861" strokeWidth={0.8} shadowColor="#62584d" shadowBlur={2} shadowOpacity={0.15} />
              <Line points={[-podWidth * 0.36, 0, podWidth * 0.36, 0]} stroke="#c39d70" strokeWidth={0.7} />
              <Rect x={-10} y={podHeight * 0.38} width={20} height={11} cornerRadius={5} fill="#8da8aa" stroke="#667f82" strokeWidth={0.8} />
              <Rect x={-6} y={-podHeight * 0.16} width={12} height={7} cornerRadius={1} fill="#37474f" />
            </Group>
          );
        });
      })()}
      {object.type === 'open_desk' && (() => {
        const capacity = Math.max(1, Number(object.capacity) || 10);
        const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(capacity * object.width / object.height))));
        const rows = Math.ceil(capacity / columns);
        const gapX = Math.min(70, (object.width - 44) / columns);
        const gapY = Math.min(58, (object.height - 62) / rows);
        return Array.from({ length: capacity }, (_, index) => {
          const x = object.width / 2 - gapX * (columns - 1) / 2 + (index % columns) * gapX;
          const y = object.height / 2 - gapY * (rows - 1) / 2 + Math.floor(index / columns) * gapY;
          return (
            <Group key={`open-desk-${index}`} x={x} y={y} listening={false}>
              <Rect x={-24} y={-14} width={48} height={28} cornerRadius={3} fill="#d2d7d3" stroke="#858f89" />
              <Rect x={-12} y={-27} width={24} height={12} cornerRadius={3} fill="#bdc5bf" stroke="#858f89" />
            </Group>
          );
        });
      })()}
      {object.type !== 'wall' && ['chair', 'desk', 'table', 'private_cabin', 'conference_room', 'meeting_room', 'open_desk'].includes(object.type) && (
        <>
          <Text
            x={3}
            y={object.height - 25}
            width={object.width - 6}
            align="center"
            text={(object.label && !/^(north|south)(\s+(direction|entrance))?$/i.test(object.label.trim()) ? object.label : (object.type === 'private_cabin' ? 'PRIVATE CABIN' : object.type.replaceAll('_', ' ').toUpperCase()))}
            fontFamily="Arial"
            fontSize={Math.min(10, Math.max(7, object.width / 12))}
            fontStyle="bold"
            fill="#536273"
            ellipsis
            listening={false}
          />
          {Number(object.capacity) > 0 && !['chair', 'desk'].includes(object.type) && (
            <Text
              x={3}
              y={object.height - 14}
              width={object.width - 6}
              align="center"
              text={`${Number(object.capacity)} SEATER${bookingSpace ? ` · ${String(bookingSpace.status).toUpperCase()}` : ''}`}
              fontFamily="Arial"
              fontSize={7}
              fill={bookingSpace?.status === 'Available' ? '#15803d' : bookingSpace ? '#b91c1c' : '#64748b'}
              ellipsis
              listening={false}
            />
          )}
        </>
      )}
      {object.type !== 'wall' && !['chair', 'desk', 'table', 'private_cabin', 'conference_room', 'meeting_room', 'open_desk'].includes(object.type) && (
        <Text
          x={3}
          y={object.height / 2 - 5}
          width={object.width - 6}
          align="center"
          text={object.label && !/^(north|south)(\s+(direction|entrance))?$/i.test(object.label.trim()) ? object.label : object.type.replaceAll('_', ' ').toUpperCase()}
          fontFamily="Arial"
          fontSize={Math.min(10, Math.max(7, object.width / 9))}
          fontStyle="bold"
          fill="#536273"
          ellipsis
          listening={false}
        />
      )}
    </Group>
    {transformable && editable && selected && (
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        flipEnabled={false}
        keepRatio={false}
        ignoreStroke
        anchorSize={9}
        anchorCornerRadius={3}
        anchorFill="#ffffff"
        anchorStroke="#2563eb"
        anchorStrokeWidth={2}
        borderStroke="#2563eb"
        borderStrokeWidth={1.5}
        enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
        boundBoxFunc={(oldBox, newBox) => newBox.width < 20 || newBox.height < 20 ? oldBox : newBox}
      />
    )}
    </>
  );
}

function WorkspaceRoom({
  space,
  selected,
  bookingMode,
  bookingCategory,
  layoutEditable,
  requestedSeatCount,
  onSelect,
  onLayoutChange,
}) {
  const status = STATUS_STYLE[space.status] || STATUS_STYLE.Available;
  const width = Math.max(150, Number(space.layoutWidth) || 220);
  const height = Math.max(190, Number(space.layoutHeight) || 220);
  const canSelect = !bookingMode || (
    isWorkspaceInBookingCategory(space, bookingCategory) &&
    space.status === 'Available' && space.availableCapacity >= requestedSeatCount
  );
  const doorGap = 54;
  const doorY = height;
  const doorX = width - 58;
  const roomLabel = space.type.includes('CONFERENCE')
    ? 'MEETING ROOM'
    : ['HOT_DESK', 'OPEN_DESK', 'HOTDESK'].includes(space.type)
      ? 'HOT DESK'
      : 'PRIVATE CABIN';

  return (
    <Group
      x={space.layoutX}
      y={space.layoutY}
      draggable={layoutEditable}
      onClick={!layoutEditable && canSelect ? onSelect : undefined}
      onTap={!layoutEditable && canSelect ? onSelect : undefined}
      onDragEnd={(event) => {
        const gridSize = 20;
        const x = Math.max(24, Math.min(1320 - width - 24, Math.round(event.target.x() / gridSize) * gridSize));
        const y = Math.max(80, Math.min(780 - height - 24, Math.round(event.target.y() / gridSize) * gridSize));
        event.target.position({ x, y });
        event.target.getLayer()?.batchDraw();
        onLayoutChange?.(space.id, x, y);
      }}
      onMouseEnter={(event) => {
        if (layoutEditable) event.target.getStage().container().style.cursor = 'move';
        else if (canSelect) event.target.getStage().container().style.cursor = 'pointer';
      }}
      onMouseLeave={(event) => {
        event.target.getStage().container().style.cursor = 'default';
      }}
    >
      <Rect
        width={width}
        height={height}
        fill={status.room}
        stroke="transparent"
        shadowColor="#475569"
        shadowBlur={selected ? 10 : 3}
        shadowOpacity={selected ? 0.2 : 0.08}
        shadowOffsetY={2}
      />
      <RoomFurniture space={space} width={width} height={height} color={status.seat} />

      <Line
        points={[0, 0, width, 0, width, height, doorX + doorGap, doorY]}
        stroke={layoutEditable ? '#6366f1' : selected ? '#2563eb' : status.wall}
        strokeWidth={layoutEditable || selected ? 4 : 3}
        lineCap="square"
        listening={false}
      />
      <Line
        points={[doorX, doorY, 0, height, 0, 0]}
        stroke={layoutEditable ? '#6366f1' : selected ? '#2563eb' : status.wall}
        strokeWidth={layoutEditable || selected ? 4 : 3}
        lineCap="square"
        listening={false}
      />
      <Arc
        x={doorX + doorGap}
        y={doorY}
        innerRadius={doorGap}
        outerRadius={doorGap}
        angle={90}
        rotation={180}
        stroke="#9ba6b3"
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[doorX + doorGap, doorY, doorX + doorGap, doorY - doorGap]}
        stroke="#9ba6b3"
        strokeWidth={1.5}
        listening={false}
      />
      <Rect x={12} y={9} width={Math.min(width - 24, 164)} height={32} fill="#ffffff" opacity={0.92} listening={false} />
      <Text
        x={17}
        y={12}
        width={Math.min(width - 34, 154)}
        text={space.name}
        fontFamily="Arial"
        fontSize={11}
        fontStyle="bold"
        fill="#253247"
        ellipsis
        wrap="none"
        listening={false}
      />
      <Text
        x={17}
        y={27}
        width={Math.min(width - 34, 154)}
        text={`${roomLabel}  ·  ${space.availableCapacity}/${space.capacity} available`}
        fontFamily="Arial"
        fontSize={8}
        fill={status.accent}
        ellipsis
        listening={false}
      />
      <Rect x={width - 17} y={8} width={9} height={9} cornerRadius={5} fill={canSelect ? status.seat : '#a9b2bf'} listening={false} />
    </Group>
  );
}

const layoutObjectCategory = (objectOrType) => {
  const value = String(typeof objectOrType === 'string' ? objectOrType : objectOrType?.type || '').toLowerCase();
  if (['private_cabin', 'cabin'].includes(value)) return 'private_cabin';
  if (['conference_room', 'meeting_room'].includes(value)) return 'conference_room';
  if (['podcast_room'].includes(value)) return 'podcast_room';
  if (['open_desk', 'desk', 'table'].includes(value)) return 'open_desk';
  return '';
};

const workspaceCategory = (space) => {
  const value = String(space?.type || '').toUpperCase();
  if (value.includes('PRIVATE') || value.includes('CABIN') || value.includes('OFFICE')) return 'private_cabin';
  if (value.includes('CONFERENCE') || value.includes('MEETING')) return 'conference_room';
  if (value.includes('PODCAST') || value.includes('STUDIO') || value.includes('RECORD')) return 'podcast_room';
  if (value.includes('OPEN') || value.includes('HOT') || value.includes('DESK')) return 'open_desk';
  return '';
};

function isWorkspaceInBookingCategory(space, category) {
  if (!category) return true;
  const type = String(space?.type || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const matches = {
    hot: /HOTDESK|FLEX|OPEN.?DESK/.test(type),
    dedicated: /DEDICATED/.test(type),
    office: /PRIVATE.?CABIN|CABIN|OFFICE/.test(type),
    meeting: /CONFERENCE|MEETING|BOARDROOM/.test(type),
    podcast: /PODCAST|STUDIO|RECORD/.test(type),
  };
  return Boolean(matches[category]);
}

export default function KonvaFloorCanvas({
  spaces,
  branch,
  floor,
  selectedSpaceId,
  bookingMode,
  layoutEditable = false,
  layoutOnly = false,
  layoutObjects = [],
  selectedLayoutObjectId,
  selectedLayoutObjectIds = [],
  requestedSeatCount = 1,
  bookingCategory,
  zoom = 1,
  onSelectSpace,
  onLayoutChange,
  onLayoutObjectMove,
  onLayoutObjectResize,
  onSelectLayoutObject,
}) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [alignmentGuides, setAlignmentGuides] = useState({ x: null, y: null });
  const layoutSpacesByObjectId = useMemo(() => {
    const mapping = {};
    if (!bookingMode) return mapping;
    const used = new Set();
    layoutObjects.forEach((object) => {
      const category = layoutObjectCategory(object);
      if (!category) return;
      const capacity = Number(object.capacity) || 0;
      const candidates = spaces.filter((space) => workspaceCategory(space) === category && !used.has(String(space.id)));
      let match = candidates.find((space) => Number(space.capacity) === capacity);
      if (!match && capacity > 0) match = candidates.find((space) => Math.abs(Number(space.capacity) - capacity) <= 2);
      if (!match) match = candidates.find((space) => String(space.name || '').toLowerCase().includes(String(object.label || '').toLowerCase().replace(' · ', ' ')));
      if (!match) match = candidates[0];
      if (match) {
        mapping[object.id] = match;
        used.add(String(match.id));
      }
    });
    return mapping;
  }, [bookingMode, layoutObjects, spaces]);
  const visibleLayoutObjects = layoutObjects;
  const showLayoutObjectsOnly = layoutOnly && (
    !bookingMode || visibleLayoutObjects.length > 0
  );
  const layoutSpaces = Object.values(layoutSpacesByObjectId);
  const visibleSpaces = showLayoutObjectsOnly
    ? bookingMode
      ? spaces.filter((space) => !layoutSpaces.some((layoutSpace) => String(layoutSpace.id) === String(space.id)))
      : layoutObjects.length ? [] : spaces
    : spaces;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(Math.min(width / CANVAS_WIDTH, 1));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="konva-floor-canvas-wrap" ref={containerRef}>
      <Stage
        width={CANVAS_WIDTH * scale * zoom}
        height={CANVAS_HEIGHT * scale * zoom}
        scaleX={scale * zoom}
        scaleY={scale * zoom}
        aria-label="Interactive workspace map"
        onMouseDown={(event) => {
          if (!layoutEditable || !onSelectLayoutObject) return;
          const target = event.target;
          let node = target;
          let clickedObject = target.name() === 'floor-object';
          while (!clickedObject && node?.getParent?.()) {
            node = node.getParent();
            clickedObject = node.name() === 'floor-object';
          }
          const transformerAnchors = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
          let current = target;
          let clickedTransformer = transformerAnchors.includes(String(current?.name?.() || current?.attrs?.name || ''));
          while (!clickedTransformer && current?.getParent?.()) {
            current = current.getParent();
            clickedTransformer = transformerAnchors.includes(String(current?.name?.() || current?.attrs?.name || '')) || current?.className === 'Transformer';
          }
          if (!clickedObject && !clickedTransformer) onSelectLayoutObject(null);
        }}
      >
        <Layer>
          <Rect
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fill="#f1f0ec"
            cornerRadius={14}
            shadowColor="#9da6a0"
            shadowBlur={18}
            shadowOpacity={0.12}
          />
          {Array.from({ length: 12 }, (_, index) => (
            <Group key={`plan-coordinate-x-${index}`} listening={false}>
              <Line points={[18 + index * 108, 73, 18 + index * 108, 78]} stroke="#aeb3ae" strokeWidth={1} />
              <Text x={18 + index * 108 - 6} y={59} width={12} align="center" text={String(index + 1).padStart(2, '0')} fontFamily="Arial" fontSize={7} fill="#9aa09b" />
            </Group>
          ))}
          {Array.from({ length: 7 }, (_, index) => (
            <Group key={`plan-coordinate-y-${index}`} listening={false}>
              <Line points={[24, 112 + index * 96, 29, 112 + index * 96]} stroke="#aeb3ae" strokeWidth={1} />
              <Text x={10} y={108 + index * 96} text={String.fromCharCode(65 + index)} fontFamily="Arial" fontSize={7} fill="#9aa09b" />
            </Group>
          ))}
          <Rect x={30} y={80} width={CANVAS_WIDTH - 60} height={CANVAS_HEIGHT - 110} fill="#fdfcf9" stroke="#343d38" strokeWidth={4} listening={false} />
          <Rect x={36} y={86} width={CANVAS_WIDTH - 72} height={CANVAS_HEIGHT - 122} fill="#f3ede0" stroke="#aeb5b0" strokeWidth={1} listening={false} />
          {Array.from({ length: 26 }, (_, index) => (
            <Line key={`wood-grain-${index}`} points={[38, 92 + index * 23, CANVAS_WIDTH - 38, 92 + index * 23]} stroke="#ddcfb8" strokeWidth={0.55} opacity={0.34} listening={false} />
          ))}
          <Line points={[30, 80, 44, 80, 30, 94]} stroke="#343d38" strokeWidth={4} listening={false} />
          <Line points={[CANVAS_WIDTH - 30, 80, CANVAS_WIDTH - 44, 80, CANVAS_WIDTH - 30, 94]} stroke="#343d38" strokeWidth={4} listening={false} />
          <Line points={[30, CANVAS_HEIGHT - 30, 44, CANVAS_HEIGHT - 30, 30, CANVAS_HEIGHT - 44]} stroke="#343d38" strokeWidth={4} listening={false} />
          <Line points={[CANVAS_WIDTH - 30, CANVAS_HEIGHT - 30, CANVAS_WIDTH - 44, CANVAS_HEIGHT - 30, CANVAS_WIDTH - 30, CANVAS_HEIGHT - 44]} stroke="#343d38" strokeWidth={4} listening={false} />
          <Line points={[20, CANVAS_HEIGHT - 58, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 58]} stroke="#babdb9" strokeWidth={1} dash={[4, 4]} listening={false} />
          <Line points={[20, 70, CANVAS_WIDTH - 20, 70]} stroke="#8f9691" strokeWidth={1} listening={false} />
          <Line points={[20, 66, 20, 74]} stroke="#8f9691" strokeWidth={1} listening={false} />
          <Line points={[CANVAS_WIDTH - 20, 66, CANVAS_WIDTH - 20, 74]} stroke="#8f9691" strokeWidth={1} listening={false} />
          <Text x={CANVAS_WIDTH / 2 - 60} y={55} width={120} align="center" text="GENERAL FLOOR PLAN" fontFamily="Arial" fontSize={7} fill="#8f9691" letterSpacing={1} listening={false} />
          <Text
            x={44}
            y={43}
            text={`${String(branch || 'Workspace').toUpperCase()}  /  ${String(floor || 'GROUND FLOOR').toUpperCase()}`}
            fontFamily="Arial"
            fontSize={12}
            fontStyle="bold"
            fill="#64748b"
            letterSpacing={1}
            listening={false}
          />
          <Text
            x={CANVAS_WIDTH - 200}
            y={42}
            width={150}
            align="right"
            text={layoutEditable ? 'DRAG ROOMS TO ARRANGE' : 'WORKSPACE FLOOR PLAN'}
            fontFamily="Arial"
            fontSize={9}
            fontStyle="bold"
            fill="#8490a0"
            listening={false}
          />
          {visibleSpaces.map((space) => (
            <WorkspaceRoom
              key={space.id}
              space={space}
              selected={String(selectedSpaceId || '') === String(space.id)}
              bookingMode={bookingMode}
              bookingCategory={bookingCategory}
              layoutEditable={layoutEditable}
              requestedSeatCount={requestedSeatCount}
              onSelect={() => onSelectSpace(space)}
              onLayoutChange={onLayoutChange}
            />
          ))}
          {alignmentGuides.x !== null && <Line points={[alignmentGuides.x, 70, alignmentGuides.x, CANVAS_HEIGHT - 30]} stroke="#ef4444" strokeWidth={1.5} dash={[7, 5]} listening={false} />}
          {alignmentGuides.y !== null && <Line points={[30, alignmentGuides.y, CANVAS_WIDTH - 30, alignmentGuides.y]} stroke="#ef4444" strokeWidth={1.5} dash={[7, 5]} listening={false} />}
          {visibleLayoutObjects.map((object) => (
            <FloorObject
              key={object.id}
              object={object}
              editable={layoutEditable}
              selected={selectedLayoutObjectIds.map(String).includes(String(object.id)) || String(selectedLayoutObjectId) === String(object.id)}
              transformable={String(selectedLayoutObjectId) === String(object.id)}
              objects={layoutObjects}
              bookingMode={bookingMode}
              bookingCategory={bookingCategory}
              bookingSpace={layoutSpacesByObjectId[object.id]}
              onSpaceSelect={onSelectSpace}
              onSelect={onSelectLayoutObject}
              onMove={onLayoutObjectMove}
              onResize={onLayoutObjectResize}
              onAlignmentGuide={setAlignmentGuides}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
