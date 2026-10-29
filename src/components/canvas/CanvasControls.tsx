import React from 'react';
import {
  Map as MapIcon,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '../ui';

export interface CanvasControlsProps {
  zoomPercent: number;
  showMinimap: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetView: () => void;
  onToggleMinimap: () => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
  zoomPercent,
  showMinimap,
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetView,
  onToggleMinimap,
}) => {
  return (
    <div
      className="ff-canvas-controls"
      role="toolbar"
      aria-label="Canvas navigation controls"
    >
      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Zoom out"
        title="Zoom out"
        onClick={onZoomOut}
      >
        <ZoomOut size={14} />
      </Button>

      <span
        className="ff-canvas-controls__zoom ff-tabular ff-mono"
        aria-label={`Zoom level ${zoomPercent}%`}
      >
        {zoomPercent}%
      </span>

      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Zoom in"
        title="Zoom in"
        onClick={onZoomIn}
      >
        <ZoomIn size={14} />
      </Button>

      <span className="ff-canvas-controls__divider" aria-hidden="true" />

      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Fit view"
        title="Fit workflow to view"
        onClick={onFitView}
      >
        <Maximize2 size={14} />
      </Button>

      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Reset view"
        title="Reset zoom to 100%"
        onClick={onResetView}
      >
        <RotateCcw size={14} />
      </Button>

      <Button
        variant={showMinimap ? 'secondary' : 'tertiary'}
        size="sm"
        iconOnly
        aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
        title={showMinimap ? 'Hide minimap' : 'Show minimap'}
        onClick={onToggleMinimap}
      >
        <MapIcon size={14} />
      </Button>
    </div>
  );
};

