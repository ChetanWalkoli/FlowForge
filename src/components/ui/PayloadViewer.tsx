import React, { useState } from 'react';
import { Check, Copy, WrapText } from 'lucide-react';
import { Button } from './Button';

export interface PayloadViewerProps {
  title: string;
  payload: unknown;
  emptyLabel?: string;
}

export const PayloadViewer: React.FC<PayloadViewerProps> = ({
  title,
  payload,
  emptyLabel = 'No payload recorded',
}) => {
  const [wrapped, setWrapped] = useState(true);
  const [copied, setCopied] = useState(false);

  const formatted =
    payload === undefined
      ? emptyLabel
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, null, 2);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formatted);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write unavailable in non-secure context
    }
  };

  return (
    <div className="ff-payload-viewer">
      <div className="ff-payload-viewer__header">
        <span className="ff-payload-viewer__title">{title}</span>
        <div className="ff-payload-viewer__controls">
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label={wrapped ? 'Disable line wrap' : 'Enable line wrap'}
            title={wrapped ? 'Disable line wrap' : 'Enable line wrap'}
            onClick={() => setWrapped((prev) => !prev)}
          >
            <WrapText size={13} />
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            aria-label={`Copy ${title}`}
            title={`Copy ${title}`}
            onClick={handleCopy}
            leftIcon={copied ? <Check size={12} /> : <Copy size={12} />}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-label={`${title} content`}
        className={`ff-payload-viewer__code ${
          wrapped ? 'ff-payload-viewer__code--wrap' : ''
        }`.trim()}
      >
        <code>{formatted}</code>
      </pre>
    </div>
  );
};

