import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { QRCodeCanvas } from 'qrcode.react';

import { tokens } from '../theme.js';

const DEFAULT_FG = tokens.sapphire;
const DEFAULT_BG = '#ffffff';
const QR_SIZE = 260;
const LOGO_CANVAS_SIZE = 96; // rendered larger than displayed for crisp downscaling
const LOGO_DISPLAY_SIZE = 44;

// Every template is drawn locally on an offscreen canvas - never loaded from
// an external URL. This guarantees the logo is always exactly the right
// size and shape to sit cleanly in the QR's center (the problem with
// arbitrary image URLs), and as a side effect it also means PNG export can
// never fail with a "tainted canvas" CORS error, since nothing cross-origin
// is ever drawn.
function drawStar(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  const step = Math.PI / points;
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, cx, cy, size) {
  const top = cy - size * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, top + size * 0.32);
  ctx.bezierCurveTo(cx, top, cx - size / 2, top, cx - size / 2, top + size * 0.32);
  ctx.bezierCurveTo(cx - size / 2, top + size * 0.66, cx, top + size * 0.8, cx, top + size);
  ctx.bezierCurveTo(cx, top + size * 0.8, cx + size / 2, top + size * 0.66, cx + size / 2, top + size * 0.32);
  ctx.bezierCurveTo(cx + size / 2, top, cx, top, cx, top + size * 0.32);
  ctx.closePath();
  ctx.fill();
}

function generateLogoDataUrl({ template, monogramText, color }) {
  if (template === 'none') return null;

  const canvas = document.createElement('canvas');
  canvas.width = LOGO_CANVAS_SIZE;
  canvas.height = LOGO_CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  const c = LOGO_CANVAS_SIZE / 2;

  // Circular colored badge behind every template, for a consistent look.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';

  if (template === 'monogram') {
    const text = (monogramText || '?').trim().slice(0, 2).toUpperCase() || '?';
    ctx.font = `700 ${LOGO_CANVAS_SIZE * 0.42}px "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c, c + 2);
  } else if (template === 'star') {
    drawStar(ctx, c, c, c * 0.62, c * 0.28, 5);
  } else if (template === 'heart') {
    drawHeart(ctx, c, c, c * 1.15);
  } else if (template === 'dot') {
    ctx.beginPath();
    ctx.arc(c, c, c * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL('image/png');
}

export function QrCodeDialog({ open, onClose, url, label }) {
  const canvasWrapperRef = useRef(null);
  const [fgColor, setFgColor] = useState(DEFAULT_FG);
  const [bgColor, setBgColor] = useState(DEFAULT_BG);
  const [template, setTemplate] = useState('none');
  const [monogramText, setMonogramText] = useState('');

  const logoDataUrl = useMemo(
    () => generateLogoDataUrl({ template, monogramText, color: fgColor }),
    [template, monogramText, fgColor]
  );

  // This one component instance is reused for every link's QR button (see
  // LinksTable.jsx / CreateLinkForm.jsx) - without resetting on url change,
  // customizing Link A's colors/logo would still be showing when you next
  // open Link B's QR code.
  useEffect(() => {
    setFgColor(DEFAULT_FG);
    setBgColor(DEFAULT_BG);
    setTemplate('none');
    setMonogramText('');
  }, [url]);

  function handleDownload() {
    const canvas = canvasWrapperRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-${label || 'code'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <QrCode2Icon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Your QR code
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', mb: 3 }}>
          <Paper
            elevation={3}
            ref={canvasWrapperRef}
            sx={{
              p: 3,
              bgcolor: bgColor,
              borderRadius: 4,
              display: 'inline-flex',
            }}
          >
            <QRCodeCanvas
              value={url}
              size={QR_SIZE}
              fgColor={fgColor}
              bgColor={bgColor}
              // High error-correction whenever a logo covers part of the
              // code - without this, an embedded image can make it unscannable.
              level={template !== 'none' ? 'H' : 'M'}
              imageSettings={
                logoDataUrl
                  ? { src: logoDataUrl, height: LOGO_DISPLAY_SIZE, width: LOGO_DISPLAY_SIZE, excavate: true }
                  : undefined
              }
            />
          </Paper>
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Brand colors
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <TextField
            label="Foreground"
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Background"
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            fullWidth
            size="small"
          />
        </Stack>

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Center logo
        </Typography>
        <ToggleButtonGroup
          value={template}
          exclusive
          onChange={(e, value) => value && setTemplate(value)}
          size="small"
          fullWidth
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="none" aria-label="no logo">
            <BlockIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="monogram" aria-label="monogram">
            <TextFieldsIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="star" aria-label="star">
            <StarRoundedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="heart" aria-label="heart">
            <FavoriteRoundedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="dot" aria-label="dot">
            <FiberManualRecordIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>

        {template === 'monogram' && (
          <TextField
            label="Initials (1-2 letters)"
            value={monogramText}
            onChange={(e) => setMonogramText(e.target.value.slice(0, 2))}
            fullWidth
            size="small"
            placeholder="AB"
            sx={{ mb: 1.5 }}
          />
        )}

        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all', display: 'block', mt: 1 }}>
          {url}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={handleDownload}>
          Download PNG
        </Button>
      </DialogActions>
    </Dialog>
  );
}
