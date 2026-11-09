import React from 'react';
import { Card, CardBody } from 'reactstrap';

/**
 * StatMetricCard - Luxury elevated stat card used across all NanoSpace management pages.
 * Supports distinct color identities (blue, green, orange, purple, etc.) with overflow protection.
 */
export default function StatMetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  className = '',
}) {
  const strVal = String(value ?? '');
  const isCompactValue = strVal.length > 7;

  return (
    <Card className={`mini-metric border-0 h-100 tone-${tone} ${className}`}>
      <div className={`metric-top-bar tone-${tone}`} />
      <CardBody className="p-3 d-flex flex-column justify-content-between">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="mini-label text-truncate" title={label}>
            {label}
          </span>
          {Icon && (
            <div className={`mini-metric-icon tone-${tone} flex-shrink-0`}>
              <Icon size={18} />
            </div>
          )}
        </div>
        <div className="my-1">
          <div
            className={`mini-value ${isCompactValue ? 'mini-value-compact' : ''} text-truncate`}
            title={strVal}
          >
            {value}
          </div>
        </div>
        {hint && (
          <div className="d-flex align-items-center mt-2">
            <span className={`mini-hint-badge tone-${tone} text-truncate`} title={hint}>
              <span className="hint-pulse-dot" />
              {hint}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
