import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatter: (val: number) => string;
}

export const AnimatedNumber = ({ value, duration = 800, formatter }: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Spring-like easing: 1 - Math.pow(1 - progress, 3)
      const easedProgress = 1 - Math.pow(1 - progress, 4);
      
      setDisplayValue(easedProgress * value);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{formatter(displayValue)}</span>;
};
