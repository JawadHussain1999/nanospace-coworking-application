import { useState, useEffect } from 'react';
import { Table } from 'reactstrap';
import {
  FiInbox,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from 'react-icons/fi';

export function StatusBadge({ status }) {
  const statusKey = String(status || '').toLowerCase();
  let tone = 'secondary';
  if (['confirmed', 'active', 'accepted', 'completed', 'paid'].includes(statusKey)) tone = 'success';
  else if (['pending', 'in review', 'draft'].includes(statusKey)) tone = 'warning';
  else if (['sent', 'open'].includes(statusKey)) tone = 'primary';
  else if (['cancelled', 'overdue', 'rejected', 'failed'].includes(statusKey)) tone = 'danger';

  return (
    <span className={`status-pill status-pill-${tone}`}>
      <span className="status-pill-dot" />
      <span className="status-pill-text">{status || 'Unknown'}</span>
    </span>
  );
}

function getPaginationNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

export function TablePagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  pageSize = 10,
  onPageSizeChange,
  totalItems = 0,
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = 'records',
  className = '',
}) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const pages = getPaginationNumbers(currentPage, totalPages);

  return (
    <div className={`table-pagination ${className}`}>
      <div className="pagination-left">
        <span className="pagination-info">
          Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalItems}</strong> {itemLabel}
        </span>
        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 && (
          <div className="pagination-size-select">
            <label htmlFor="pagination-rows-select" className="mb-0 text-muted">Rows per page:</label>
            <select
              id="pagination-rows-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Select rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-controls" role="navigation" aria-label="Table pagination navigation">
        <button
          type="button"
          className="pagination-btn pagination-btn-nav"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="First page"
          aria-label="First page"
        >
          <FiChevronsLeft size={15} />
        </button>

        <button
          type="button"
          className="pagination-btn pagination-btn-nav"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
          aria-label="Previous page"
        >
          <FiChevronLeft size={15} />
        </button>

        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                …
              </span>
            );
          }
          const isCurrent = p === currentPage;
          return (
            <button
              key={`page-${p}`}
              type="button"
              className={`pagination-btn ${isCurrent ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={`Page ${p}`}
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          className="pagination-btn pagination-btn-nav"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Next page"
          aria-label="Next page"
        >
          <FiChevronRight size={15} />
        </button>

        <button
          type="button"
          className="pagination-btn pagination-btn-nav"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="Last page"
          aria-label="Last page"
        >
          <FiChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function DataTable({
  columns,
  rows = [],
  rowKey,
  emptyMessage = 'No records found in this view.',
  pagination = true,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = 'records',
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 if the dataset changes or filters apply
  useEffect(() => {
    setPage(1);
  }, [rows?.length]);

  if (!rows || rows.length === 0) {
    return (
      <div className="data-table-container">
        <div className="table-responsive">
          <Table className="align-middle data-table mb-0">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
          </Table>
          <div className="table-empty-state">
            <div className="table-empty-icon">
              <FiInbox size={28} />
            </div>
            <h6>{emptyMessage}</h6>
            <p>Try selecting a different branch, adjusting filters, or creating a new record.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activePage = Math.min(Math.max(1, page), totalPages);

  const paginatedRows = pagination
    ? rows.slice((activePage - 1) * pageSize, activePage * pageSize)
    : rows;

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <div className="data-table-container">
      <div className="table-responsive">
        <Table hover className="align-middle data-table mb-0">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, i) => {
              const key = typeof rowKey === 'function' ? rowKey(row) : (rowKey ? row[rowKey] : i);
              return (
                <tr key={key}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render ? c.render(row[c.key], row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {pagination && (
        <TablePagination
          currentPage={activePage}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          totalItems={totalItems}
          pageSizeOptions={pageSizeOptions}
          itemLabel={itemLabel}
        />
      )}
    </div>
  );
}
