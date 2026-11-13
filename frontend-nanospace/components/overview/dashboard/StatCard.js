import { Card, CardBody } from 'reactstrap';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

export default function StatCard({ label, value, change, icon: Icon, tone = 'blue', helper }) {
  const isNegative = String(change).startsWith('-');
  const TrendIcon = isNegative ? FiTrendingDown : FiTrendingUp;

  const isCompact = String(value).length > 8;

  return (
    <Card className={`stat-card h-100 border-0 tone-${tone}`}>
      <div className={`metric-top-bar tone-${tone}`} />
      <CardBody className="p-3">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <div className="min-w-0 flex-grow-1">
            <div className="stat-label text-truncate" title={label}>{label}</div>
            <div className={`stat-value ${isCompact ? 'stat-value-compact' : ''} text-truncate`} title={String(value)}>{value}</div>
          </div>
          <div className={`stat-icon ${tone} flex-shrink-0`}>
            <Icon size={20} />
          </div>
        </div>
        <div className="stat-foot mt-3 d-flex align-items-center gap-2">
          {change && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 700,
                background: isNegative ? '#fef2f2' : '#ecfdf5',
                color: isNegative ? '#dc2626' : '#059669',
                border: `1px solid ${isNegative ? '#fecaca' : '#a7f3d0'}`,
              }}
            >
              <TrendIcon size={12} />
              {change.replace(/^[↑↓]\s*/, '')}
            </span>
          )}
          <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>{helper || 'vs. last month'}</span>
        </div>
      </CardBody>
    </Card>
  );
}
