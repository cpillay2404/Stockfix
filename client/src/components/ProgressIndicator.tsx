import { motion } from "framer-motion";
import { Star, Trophy, Flame } from "lucide-react";

interface ProgressIndicatorProps {
  current: number;
  total: number;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  animate?: boolean;
}

export function ProgressBar({ 
  current, 
  total, 
  showPercentage = true, 
  size = 'md',
  label,
  animate = true 
}: ProgressIndicatorProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  const heights = { sm: '4px', md: '8px', lg: '12px' };
  const height = heights[size];
  
  const getColor = () => {
    if (percentage >= 90) return '#10B981';
    if (percentage >= 70) return '#F59E0B';
    if (percentage >= 50) return '#F36C21';
    return '#EF4444';
  };

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: '4px',
          fontSize: '12px',
          color: '#6B7280',
        }}>
          <span>{label}</span>
          {showPercentage && <span style={{ fontWeight: 600 }}>{percentage}%</span>}
        </div>
      )}
      <div
        style={{
          height,
          backgroundColor: '#E5E7EB',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={animate ? { width: 0 } : false}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            height: '100%',
            backgroundColor: getColor(),
            borderRadius: '999px',
          }}
        />
      </div>
      {!label && showPercentage && (
        <div style={{ 
          textAlign: 'right', 
          marginTop: '2px',
          fontSize: '11px',
          color: '#6B7280',
        }}>
          {current}/{total}
        </div>
      )}
    </div>
  );
}

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function CircularProgress({ 
  percentage, 
  size = 80, 
  strokeWidth = 8,
  showLabel = true 
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (percentage >= 90) return '#10B981';
    if (percentage >= 70) return '#F59E0B';
    return '#F36C21';
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: size / 4,
            fontWeight: 700,
            color: '#003B71',
          }}
        >
          {percentage}%
        </div>
      )}
    </div>
  );
}

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: number;
}

export function StarRating({ rating, maxRating = 5, size = 20 }: StarRatingProps) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: maxRating }, (_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: i * 0.1, type: 'spring' }}
        >
          <Star
            size={size}
            fill={i < rating ? '#FFD700' : 'none'}
            stroke={i < rating ? '#FFD700' : '#D1D5DB'}
            strokeWidth={2}
          />
        </motion.div>
      ))}
    </div>
  );
}

interface AchievementBadgeProps {
  type: 'gold' | 'silver' | 'bronze' | 'none';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
}

export function AchievementBadge({ 
  type, 
  size = 'md', 
  showLabel = false,
  animated = true 
}: AchievementBadgeProps) {
  if (type === 'none') return null;

  const config = {
    gold: { emoji: '🥇', label: 'Gold', glow: 'rgba(255, 215, 0, 0.5)' },
    silver: { emoji: '🥈', label: 'Silver', glow: 'rgba(192, 192, 192, 0.5)' },
    bronze: { emoji: '🥉', label: 'Bronze', glow: 'rgba(205, 127, 50, 0.5)' },
  };
  
  const sizes = { sm: '24px', md: '32px', lg: '48px' };
  const fontSize = sizes[size];
  const { emoji, label, glow } = config[type];

  const content = (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: showLabel ? '4px 8px' : '4px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: `0 0 12px ${glow}`,
      }}
    >
      <span style={{ fontSize }}>{emoji}</span>
      {showLabel && (
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
          {label}
        </span>
      )}
    </div>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        whileHover={{ scale: 1.1 }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}

interface StreakBadgeProps {
  streak: number;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakBadge({ streak, size = 'md' }: StreakBadgeProps) {
  if (streak === 0) return null;

  const sizes = { sm: 14, md: 18, lg: 24 };
  const iconSize = sizes[size];
  
  const getStreakColor = () => {
    if (streak >= 14) return '#DC2626';
    if (streak >= 7) return '#F59E0B';
    if (streak >= 3) return '#F97316';
    return '#6B7280';
  };

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring' }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        backgroundColor: '#FEF3C7',
        borderRadius: '12px',
        color: getStreakColor(),
      }}
    >
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
        }}
        transition={{ 
          duration: 0.5,
          repeat: Infinity,
          repeatDelay: 2,
        }}
      >
        <Flame size={iconSize} />
      </motion.div>
      <span style={{ 
        fontSize: size === 'sm' ? '12px' : size === 'md' ? '14px' : '16px',
        fontWeight: 700,
      }}>
        {streak} day{streak !== 1 ? 's' : ''}
      </span>
    </motion.div>
  );
}

interface MilestoneProps {
  current: number;
  milestones: number[];
  label?: string;
}

export function MilestoneTracker({ current, milestones, label }: MilestoneProps) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {milestones.map((milestone, i) => {
          const isReached = current >= milestone;
          const isNext = !isReached && (i === 0 || current >= milestones[i - 1]);
          
          return (
            <div key={milestone} style={{ display: 'flex', alignItems: 'center' }}>
              <motion.div
                initial={isReached ? { scale: 0 } : false}
                animate={{ scale: 1 }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: isReached ? '#10B981' : isNext ? '#FEF3C7' : '#F3F4F6',
                  border: isNext ? '2px solid #F59E0B' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: isReached ? 'white' : '#6B7280',
                }}
              >
                {isReached ? (
                  <Trophy size={14} />
                ) : (
                  milestone
                )}
              </motion.div>
              {i < milestones.length - 1 && (
                <div
                  style={{
                    width: '20px',
                    height: '2px',
                    backgroundColor: current >= milestones[i + 1] ? '#10B981' : '#E5E7EB',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
