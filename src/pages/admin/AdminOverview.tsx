import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Activity,
  Gift,
  IndianRupee,
  Coins,
  Eye,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Mock data for demonstration — replace with real queries
const mockStats = [
  { label: "Total Users", value: "1,248", change: 4.2, up: true, today: 12, icon: Users },
  { label: "Active Today", value: "89", change: 8.1, up: true, today: null, icon: Activity },
  { label: "Gift Sessions", value: "3,642", change: 2.5, up: true, today: null, icon: Gift },
  { label: "Revenue This Month", value: "₹1,24,500", change: 12.3, up: true, today: null, icon: IndianRupee },
  { label: "Credits in Circulation", value: "18,420", change: 1.8, up: false, today: null, icon: Coins },
  { label: "Blog Views", value: "4,210", change: 15.2, up: true, today: null, icon: Eye },
];

const signupData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  users: Math.floor(Math.random() * 50) + 10,
}));

const funnelData = [
  { stage: "Signup", count: 1248 },
  { stage: "Onboarding", count: 940 },
  { stage: "First Gift", count: 612 },
  { stage: "Purchase", count: 285 },
];

const occasionData = [
  { name: "Birthday", value: 420 },
  { name: "Diwali", value: 310 },
  { name: "Anniversary", value: 280 },
  { name: "Wedding", value: 190 },
  { name: "Valentine's", value: 150 },
  { name: "Other", value: 292 },
];

const OCCASION_COLORS = [
  "hsl(249 76% 64%)",
  "hsl(0 100% 70%)",
  "hsl(168 100% 36%)",
  "hsl(45 97% 71%)",
  "hsl(244 98% 81%)",
  "hsl(195 6% 45%)",
];

const revenueByPackage = [
  { name: "Starter", revenue: 32400 },
  { name: "Popular", revenue: 58700 },
  { name: "Pro", revenue: 33400 },
];

const recentActivity = [
  { time: "2 min ago", user: "Priya S.", action: "Purchased Popular plan", type: "purchase" },
  { time: "8 min ago", user: "Rahul K.", action: "Completed gift session for Birthday", type: "gift" },
  { time: "15 min ago", user: "Ananya M.", action: "Signed up", type: "signup" },
  { time: "22 min ago", user: "Vikram P.", action: "Purchased Starter plan", type: "purchase" },
  { time: "35 min ago", user: "Sneha R.", action: "Completed gift session for Diwali", type: "gift" },
  { time: "1h ago", user: "Arjun D.", action: "Added 3 recipients", type: "action" },
  { time: "1h ago", user: "Meera L.", action: "Purchased Pro plan", type: "purchase" },
  { time: "2h ago", user: "Karthik N.", action: "Signed up via referral", type: "signup" },
  { time: "2h ago", user: "Divya G.", action: "Left feedback on gift session", type: "action" },
  { time: "3h ago", user: "Amit S.", action: "Completed gift session for Anniversary", type: "gift" },
];

const typeBadgeMap: Record<string, { label: string; className: string }> = {
  purchase: { label: "Purchase", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  gift: { label: "Gift", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  signup: { label: "Signup", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  action: { label: "Action", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

const AdminOverview = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-bold text-foreground">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockStats.map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {stat.up ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        stat.up ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {stat.change}%
                    </span>
                    {stat.today && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        +{stat.today} today
                      </Badge>
                    )}
                  </div>
                </div>
                <stat.icon className="w-5 h-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signups line chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">User Signups (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signupData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Funnel (horizontal bar descending) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Occasions pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Occasions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={occasionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: "10px" }}
                  >
                    {occasionData.map((_, i) => (
                      <Cell key={i} fill={OCCASION_COLORS[i % OCCASION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by package bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Package</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByPackage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, "Revenue"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    <Cell fill="hsl(var(--primary))" />
                    <Cell fill="hsl(168 100% 36%)" />
                    <Cell fill="hsl(0 100% 70%)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.map((item, i) => {
                const badge = typeBadgeMap[item.type] || typeBadgeMap.action;
                return (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{item.time}</TableCell>
                    <TableCell className="text-sm font-medium">{item.user}</TableCell>
                    <TableCell className="text-sm">{item.action}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverview;
