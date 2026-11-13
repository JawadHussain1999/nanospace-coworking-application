import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { branchRevenue } from '../../../data/mockData';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

const CustomBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '10px 14px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '13.5px', color: '#1e293b' }}>{label}</p>
        <div style={{ fontSize: '13.5px', color: '#3b82f6', fontWeight: 600 }}>
          Revenue: ₹{Number(payload[0].value).toLocaleString('en-IN')}
        </div>
      </div>
    );
  }
  return null;
};

export default function BookingChart({ branch = "All branches", data: apiData }) {
  const data = Array.isArray(apiData)
    ? apiData.filter((entry) => branch === "All branches" || entry.branch === branch)
    : branchRevenue.filter((entry) => branch === "All branches" || entry.branch === branch);

  return (
    <div className="chart-wrap" style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 6, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="branch" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12.5, fontWeight: 500 }} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12.5 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={58} />
          <Tooltip content={<CustomBarTooltip />} />
          <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={38}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
