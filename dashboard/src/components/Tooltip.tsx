import { useState, ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}

export default function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 px-2.5 py-1.5 text-xs text-white bg-slate-800 border border-slate-700 rounded-lg shadow-xl whitespace-nowrap pointer-events-none ${
            side === 'top'
              ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
              : 'top-full left-1/2 -translate-x-1/2 mt-2'
          }`}
        >
          {content}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 border-slate-700 rotate-45 ${
              side === 'top'
                ? 'top-full -mt-1 border-r border-b'
                : 'bottom-full -mb-1 border-l border-t'
            }`}
          />
        </div>
      )}
    </div>
  );
}
