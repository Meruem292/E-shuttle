import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info, HelpCircle } from 'lucide-react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The tooltip helper content string or React node */
  content: React.ReactNode;
  /** Wrapped child component */
  children: React.ReactNode;
  /** Placement direction */
  position?: TooltipPosition;
  /** Hover delay in ms before showing (desktop) */
  delay?: number;
  /** Long-press duration in ms for mobile touch */
  longPressDuration?: number;
  /** Optional extra classes for tooltip bubble */
  className?: string;
  /** Optional extra classes for container */
  containerClassName?: string;
  /** Disable tooltip */
  disabled?: boolean;
  /** Auto-hide timeout in ms for touch/long-press (default 3000ms) */
  touchDuration?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 200,
  longPressDuration = 350,
  className = '',
  containerClassName = '',
  disabled = false,
  touchDuration = 3000,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clearAllTimers = useCallback(() => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  // Handle Desktop Hover
  const handleMouseEnter = () => {
    if (disabled || !content) return;
    clearAllTimers();
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    clearAllTimers();
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  // Handle Keyboard Focus
  const handleFocus = () => {
    if (disabled || !content) return;
    clearAllTimers();
    setIsVisible(true);
  };

  const handleBlur = () => {
    clearAllTimers();
    setIsVisible(false);
  };

  // Handle Mobile Touch Long-Press
  const handleTouchStart = () => {
    if (disabled || !content) return;
    clearAllTimers();
    longPressTimerRef.current = setTimeout(() => {
      setIsVisible(true);
      // Auto-hide after touch duration
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, touchDuration);
    }, longPressDuration);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const handleTouchCancel = () => {
    clearAllTimers();
    setIsVisible(false);
  };

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsVisible(false);
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // Position Styling Matrix
  const positionClasses: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<TooltipPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent border-t-4 border-x-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-x-transparent border-t-transparent border-b-4 border-x-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-y-transparent border-r-transparent border-l-4 border-y-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-y-transparent border-l-transparent border-r-4 border-y-4',
  };

  const motionVariants = {
    top: { initial: { opacity: 0, y: 4, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 4, scale: 0.96 } },
    bottom: { initial: { opacity: 0, y: -4, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4, scale: 0.96 } },
    left: { initial: { opacity: 0, x: 4, scale: 0.96 }, animate: { opacity: 1, x: 0, scale: 1 }, exit: { opacity: 0, x: 4, scale: 0.96 } },
    right: { initial: { opacity: 0, x: -4, scale: 0.96 }, animate: { opacity: 1, x: 0, scale: 1 }, exit: { opacity: 0, x: -4, scale: 0.96 } },
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center ${containerClassName}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {children}

      <AnimatePresence>
        {isVisible && !disabled && (
          <motion.div
            role="tooltip"
            initial={motionVariants[position].initial}
            animate={motionVariants[position].animate}
            exit={motionVariants[position].exit}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute z-50 pointer-events-none select-none ${positionClasses[position]}`}
          >
            <div
              className={`bg-slate-900/95 text-white font-medium text-xs px-2.5 py-1.5 rounded-xl shadow-xl backdrop-blur-sm border border-slate-800/80 whitespace-normal max-w-xs text-center leading-tight tracking-normal ${className}`}
            >
              {content}
              {/* Arrow pointer */}
              <div
                className={`absolute w-0 h-0 pointer-events-none ${arrowClasses[position]}`}
                aria-hidden="true"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export interface TooltipIconProps {
  content: React.ReactNode;
  position?: TooltipPosition;
  icon?: 'info' | 'help';
  size?: number;
  className?: string;
  tooltipClassName?: string;
}

export const TooltipIcon: React.FC<TooltipIconProps> = ({
  content,
  position = 'top',
  icon = 'info',
  size = 14,
  className = 'text-slate-400 hover:text-slate-600 transition-colors cursor-help',
  tooltipClassName = '',
}) => {
  const IconComponent = icon === 'help' ? HelpCircle : Info;

  return (
    <Tooltip content={content} position={position} className={tooltipClassName}>
      <span className={`inline-flex items-center justify-center p-0.5 ${className}`}>
        <IconComponent size={size} />
      </span>
    </Tooltip>
  );
};

export default Tooltip;
