import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FiGrid,
  FiTrendingUp,
  FiUsers,
  FiBriefcase,
  FiUserCheck,
  FiCreditCard,
  FiBarChart2,
  FiSettings,
  FiChevronDown,
  FiChevronRight,
  FiLayers,
  FiCommand,
  FiZap,
} from "react-icons/fi";
import { getMenuForRole } from "../../utils/permissions";
import { formatBranchName } from "../../services/api";

const icons = {
  dashboard: FiGrid,
  sales: FiTrendingUp,
  customers: FiUsers,
  workspace: FiBriefcase,
  people: FiUserCheck,
  finance: FiCreditCard,
  reports: FiBarChart2,
  settings: FiSettings,
};

export default function Sidebar({ user, open, onClose }) {
  const router = useRouter();
  const menu = getMenuForRole(user?.role);
  const [expanded, setExpanded] = useState(() => {
    const initialState = {};
    menu.forEach((group) => {
      const hasActiveChild = group.items.some(
        (item) => item.path === router.pathname || router.asPath.startsWith(item.path)
      );
      initialState[group.label] = hasActiveChild;
    });
    return initialState;
  });

  // Auto-expand group when path changes
  useEffect(() => {
    menu.forEach((group) => {
      const hasActiveChild = group.items.some(
        (item) => item.path === router.pathname || router.asPath.startsWith(item.path)
      );
      if (hasActiveChild) {
        setExpanded((prev) => ({ ...prev, [group.label]: true }));
      }
    });
  }, [router.pathname, router.asPath]);


  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? "show" : ""}`}
        onClick={onClose}
      />
      <aside className={`app-sidebar ${open ? "mobile-open" : ""}`}>
        {/* Ambient Glow Elements */}
        <div className="sidebar-ambient-glow" />

        {/* Brand Header */}
        <div className="brand-wrap">
          <Link href="/dashboard" className="brand-link">
            <img
              src="/nanospace-logo.png"
              alt="NanoSpace"
              className="brand-logo"
            />
          </Link>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>

        {/* Luxury Workspace Hub Selector */}
        <div className="workspace-pill">
          <div className="workspace-badge">
            <FiLayers className="workspace-badge-icon" />
          </div>
          <div className="workspace-meta">
            <span className="workspace-title text-truncate">
              {formatBranchName(user?.branch) || "All Branches"}
            </span>
            <div className="workspace-subtitle">
              <span className="workspace-pulse-dot" />
              <span>Active Workspace</span>
            </div>
          </div>
          <div className="workspace-switch-icon">
            <FiChevronDown size={14} />
          </div>
        </div>

        {/* Navigation Section */}
        <div className="nav-caption-row">
          <span className="nav-caption">NAVIGATION</span>
        </div>

        <nav className="side-nav">
          {menu.map((group) => {
            const Icon = icons[group.icon] || FiGrid;
            const isExpanded = expanded[group.label];
            const activeGroup = group.items.some(
              (item) => item.path === router.pathname || router.asPath === item.path
            );
            return (
              <div className="nav-group" key={group.label}>
                <button
                  className={`nav-group-title ${activeGroup ? "group-active" : ""}`}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [group.label]: !prev[group.label],
                    }))
                  }
                >
                  <span className="nav-icon-box">
                    <Icon size={15} />
                  </span>
                  <span className="nav-group-label">{group.label}</span>
                  <span className="nav-group-chevron">
                    {isExpanded ? (
                      <FiChevronDown size={13} />
                    ) : (
                      <FiChevronRight size={13} />
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="nav-subitems">
                    {group.items.map((item) => {
                      const isActive = router.pathname === item.path || router.asPath === item.path;
                      return (
                        <Link
                          href={item.path}
                          key={item.path}
                          onClick={onClose}
                          className={`nav-item ${isActive ? "active" : ""}`}
                        >
                          <span className="nav-item-indicator">
                            <span className="nav-item-dot" />
                          </span>
                          <span className="nav-item-text">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

      </aside>
    </>
  );
}
