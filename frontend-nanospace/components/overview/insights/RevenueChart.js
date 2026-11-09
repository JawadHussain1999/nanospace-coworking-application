import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { monthlyRevenue, branchRevenue } from '../../../data/mockData';

const money = (v) => `₹${(v / 1000).toFixed(0)}k`;

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '10px 14px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
      }}>
        <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '12px', color: '#1e293b' }}>{label}</p>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', margin: '3px 0' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
            <span style={{ color: '#64748b' }}>{entry.name}:</span>
            <strong style={{ color: '#0f172a' }}>₹{Number(entry.value).toLocaleString('en-IN')}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ branch = "All branches", monthlyData, selectedBranchData }) {
  const chartMonthlyData = Array.isArray(monthlyData)
    ? monthlyData
    : monthlyRevenue;

  const branchData = Array.isArray(selectedBranchData)
    ? selectedBranchData.filter((entry) => branch === "All branches" || entry.branch === branch)
    : branchRevenue.filter((entry) => branch === "All branches" || entry.branch === branch);

  return (
    <div className="chart-wrap" style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        {branch === "All branches" ? (
          <AreaChart data={chartMonthlyData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} dy={8} />
            <YAxis tickFormatter={money} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={3} fill="url(#revGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 3, fill: '#fff' }} />
            <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#expGrad)" strokeDasharray="4 4" />
          </AreaChart>
        ) : (
          <BarChart data={branchData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="branch" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
            <YAxis tickFormatter={money} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
            <Bar dataKey="revenue" name="Revenue" fill="url(#revGrad)" stroke="#3b82f6" strokeWidth={1} radius={[8, 8, 0, 0]} maxBarSize={48} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
