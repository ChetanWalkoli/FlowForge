import React from 'react';
import {
  Clock,
  Flag,
  GitBranch,
  GitMerge,
  Play,
  Repeat,
  RotateCw,
  Shuffle,
  Zap,
} from 'lucide-react';
import type { NodeType } from '../../domain/types/workflow';

export interface NodeCategoryIconProps {
  type: NodeType;
  size?: number;
  className?: string;
}

export const NodeCategoryIcon: React.FC<NodeCategoryIconProps> = ({
  type,
  size = 15,
  className = '',
}) => {
  switch (type) {
    case 'trigger':
      return <Play size={size} className={className} aria-hidden="true" />;
    case 'condition':
      return <GitBranch size={size} className={className} aria-hidden="true" />;
    case 'action':
      return <Zap size={size} className={className} aria-hidden="true" />;
    case 'transform':
      return <Shuffle size={size} className={className} aria-hidden="true" />;
    case 'end':
      return <Flag size={size} className={className} aria-hidden="true" />;
    case 'delay':
      return <Clock size={size} className={className} aria-hidden="true" />;
    case 'retry':
      return <RotateCw size={size} className={className} aria-hidden="true" />;
    case 'loop':
      return <Repeat size={size} className={className} aria-hidden="true" />;
    case 'merge':
      return <GitMerge size={size} className={className} aria-hidden="true" />;
  }
};

