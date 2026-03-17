import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
}

export const Tooltip = ({ content, children, className }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={() => setIsVisible(!isVisible)} // Toggle for mobile
    >
      {children || <Info size={14} className="text-muted-foreground/60 hover:text-accent transition-colors cursor-help" />}
      
      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#111111] border border-white/10 rounded-lg shadow-2xl z-[100] animate-fade-in pointer-events-none">
          <p className="text-[10px] leading-relaxed text-foreground font-medium text-center">
            {content}
          </p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#111111]" />
        </div>
      )}
    </div>
  );
};
