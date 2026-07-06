/**
 * TimelineRenderer — chronological event list for TIMELINE primitive results.
 *
 * Content shape:
 *   events:   [{entityId, name, type, date, eventType, property, description}]
 *   span:     { earliest, latest, durationDays }
 *   entityCount: number
 *   summary:  { eventCount, sourcesWithDates, sourcesWithoutDates }
 */
import React from 'react';
import { Box, Typography, Chip, Stack, Tooltip } from '@mui/material';

const EVENT_TYPE_COLORS = {
  ENTITY: '#3b82f6',
  RELATIONSHIP: '#8b5cf6',
};

function formatDate(dateStr) {
  if (!dateStr) return '?';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function groupByYear(events) {
  const grouped = {};
  for (const e of events) {
    const year = e.date ? new Date(e.date).getFullYear() : 'Unknown';
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(e);
  }
  return grouped;
}

export default function TimelineRenderer({ content, compact }) {
  if (!content?.events?.length) {
    return (
      <Typography color="text.secondary" variant="body2">
        No dated events found{content?.summary?.sourcesWithoutDates > 0
          ? ` (${content.summary.sourcesWithoutDates} entities had no date properties)`
          : ''}.
      </Typography>
    );
  }

  const { events, span, summary } = content;
  const displayEvents = compact ? events.slice(0, 8) : events;
  const grouped = groupByYear(displayEvents);
  const years = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return Number(a) - Number(b);
  });

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`${summary?.eventCount || 0} events`} variant="outlined" />
        {span?.earliest && (
          <Chip
            size="small"
            label={`${span.earliest.slice(0, 10)} → ${span.latest.slice(0, 10)}`}
            variant="outlined"
          />
        )}
        {span?.durationDays > 0 && (
          <Chip size="small" label={`${span.durationDays}d span`} variant="outlined" />
        )}
      </Stack>

      {years.map(year => (
        <Box key={year} sx={{ mb: 1.5 }}>
          <Typography
            variant="overline"
            sx={{ fontSize: '0.62rem', color: 'text.disabled', display: 'block', mb: 0.5 }}
          >
            {year}
          </Typography>
          {grouped[year].map((event, i) => (
            <Tooltip
              key={i}
              title={
                <Box>
                  <Typography variant="caption" fontWeight={700}>{event.name}</Typography>
                  <Typography variant="caption" display="block">{event.type}</Typography>
                  <Typography variant="caption" display="block">
                    Date: {formatDate(event.date)}
                  </Typography>
                  {event.property && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Field: {event.property}
                    </Typography>
                  )}
                  {event.description && (
                    <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mt: 0.25 }}>
                      "{event.description.slice(0, 100)}"
                    </Typography>
                  )}
                </Box>
              }
              arrow
            >
              <Box
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5, pl: 1,
                  borderLeft: '2px solid', borderColor: EVENT_TYPE_COLORS[event.eventType] || 'divider',
                }}
              >
                <Box sx={{ minWidth: 70 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                    {formatDate(event.date)}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.72rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
                >
                  {event.name}
                </Typography>
                <Chip
                  label={event.type}
                  size="small"
                  sx={{ height: 14, fontSize: '0.55rem', ml: 'auto', flexShrink: 0 }}
                  variant="outlined"
                />
              </Box>
            </Tooltip>
          ))}
        </Box>
      ))}

      {compact && events.length > 8 && (
        <Typography variant="caption" color="text.secondary">
          +{events.length - 8} more events
        </Typography>
      )}
    </Box>
  );
}
