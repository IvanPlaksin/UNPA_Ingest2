/**
 * Where the tour is plugged into this application — and the only place that knows
 * both sides.
 *
 * Everything above is `@guided-ux/tour`, which has no idea what UNPA is; everything
 * below is flowdesk-admin, which knows nothing about tours except that some of its
 * components call `useTourAnchor`. This file introduces them.
 *
 * The tour does not start by itself. The research is unambiguous: the tours people
 * finish are the ones they chose to start, and an overlay that ambushes someone on
 * first load is the one they close before reading. So there is a button, and the
 * button is all.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { GraduationCap } from 'lucide-react';
import {
  TourProvider, TourSpotlight, TourPanel, TourAssistant, useTour,
} from '@guided-ux/tour/react';
import { createHttpNarrator } from '@guided-ux/tour/voice';
import { createHttpTourProvider } from './httpTourProvider';
import { createFlowdeskHostAdapter } from './flowdeskHostAdapter';

const provider = createHttpTourProvider();

/**
 * Narration is ON from the first step.
 *
 * The package defaults to muted, for a good reason — sound that starts by itself is
 * the most complained-about behaviour a tour has. This host overrides that
 * deliberately: the tour is opened by an explicit click on "Tour", so the sound is
 * not an ambush, and a guided walk-through that stays silent until you find the
 * speaker icon is missing half of what it is for. The mute button is one click away
 * and it works.
 *
 * The audio is pre-generated when the tour is seeded and cached in Redis, so the
 * first sentence starts from cache rather than from a 2-second synthesis.
 */
const narrator = createHttpNarrator({
  endpoint: '/api/v1/tour/speak',
  lang: 'en',
  enabled: true,
});

/** The launcher. Lives inside the provider so it can start a tour. */
function TourLauncher() {
  const tour = useTour();
  const [anchorEl, setAnchorEl] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [err, setErr] = useState(null);

  const open = async (e) => {
    setAnchorEl(e.currentTarget);
    try { setScenarios(await provider.listScenarios()); } catch (x) { setErr(x.message); }
  };

  const pick = async (s) => {
    setAnchorEl(null);
    await tour.start(s.id);
  };

  const name = (s) => (typeof s.name === 'string' ? s.name : (s.name && (s.name.en || Object.values(s.name)[0])) || s.id);

  return (
    <>
      <Tooltip title="Take a guided tour of this section">
        <Button size="small" variant="outlined" startIcon={<GraduationCap size={14} />} onClick={open}>
          Tour
        </Button>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {err && <MenuItem disabled>{err}</MenuItem>}
        {!err && !scenarios.length && <MenuItem disabled>No tours are published yet</MenuItem>}
        {scenarios.map((s) => (
          <MenuItem key={s.id} onClick={() => pick(s)} sx={{ display: 'block', py: 0.75 }}>
            <Typography variant="body2">{name(s)}</Typography>
            <Typography variant="caption" color="text.disabled">{s.steps} steps</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * Mounts the tour for the whole admin section.
 *
 * The provider must wrap everything that registers an anchor, which is why this sits
 * at the page level rather than inside a tab: an anchor declared by a component that
 * mounted outside the provider would be invisible to the runner, and the tour would
 * report it as "not declared" — truthfully, and uselessly.
 */
export default function TourMount({ children }) {
  const [lang] = useState('en');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { narrator.setLanguage(lang); }, [lang]);

  // The host adapter needs this application's router. It is built here, where the
  // router exists, and handed to the provider — which passes it to the runner and,
  // separately, a NARROWED copy to the assistant.
  const makeAdapter = useMemo(() => (registry) => createFlowdeskHostAdapter({
    registry,
    navigate,
    // Read at call time, not captured: the adapter's idempotency check has to see
    // where the user is NOW, not where they were when the tour started.
    getPath: () => location.pathname,
  }), [navigate, location.pathname]);

  return (
    <TourProvider
      provider={provider}
      narrator={narrator}
      lang={lang}
      makeAdapter={makeAdapter}
      // Host Adapter Protocol v1.0, rule 7. The assistant answers questions and may
      // move the view; it may not select, reveal or expand on its own. The admin screen
      // it runs in has "promote to production" two clicks away.
      assistantAllows={['navigation', 'query']}
    >
      {children}
      <TourSpotlight />
      <TourPanel />
      <TourAssistant ask={(p) => provider.ask(p).then((r) => r.answer || r.reason)} />
    </TourProvider>
  );
}

export { TourLauncher };
