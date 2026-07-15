import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Paper, Typography, Box, useTheme } from '@mui/material';
import { fontMono } from '../theme.js';

// Recharts renders raw SVG and has no idea a dark theme exists - its
// defaults (near-black text, dark grid lines) are illegible against a dark
// background. Every color here is pulled from the live MUI theme instead of
// hardcoded, so this actually adapts when the mode toggles.
export function ClicksChart({ links }) {
  const theme = useTheme();

  const data = links
    .slice()
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 8)
    .map((l) => ({ name: `/${l.shortCode}`, clicks: l.clickCount }));

  if (data.length === 0) return null;

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3, borderRadius: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
        Clicks by link
      </Typography>
      <Box sx={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: theme.palette.text.secondary, fontFamily: fontMono }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.palette.action.hover }}
              contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8,
                fontSize: 13,
              }}
              labelStyle={{ fontFamily: fontMono, color: theme.palette.text.primary }}
            />
            <Bar dataKey="clicks" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
