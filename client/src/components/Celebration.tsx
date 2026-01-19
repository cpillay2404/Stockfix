import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CelebrationProps {
  show: boolean;
  type: 'badge' | 'streak' | 'milestone' | 'completion';
  message?: string;
  onComplete?: () => void;
}

const confettiColors = ['#FFD700', '#F36C21', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

function Confetti({ delay }: { delay: number }) {
  const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
  const startX = Math.random() * 100;
  const drift = (Math.random() - 0.5) * 50;
  
  return (
    <motion.div
      initial={{ 
        x: `${startX}vw`, 
        y: -20, 
        rotate: 0,
        opacity: 1 
      }}
      animate={{ 
        x: `${startX + drift}vw`, 
        y: '100vh', 
        rotate: Math.random() * 720 - 360,
        opacity: 0 
      }}
      transition={{ 
        duration: 2 + Math.random() * 2,
        delay,
        ease: 'easeIn'
      }}
      style={{
        position: 'fixed',
        width: `${8 + Math.random() * 8}px`,
        height: `${8 + Math.random() * 8}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}

function StarBurst() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0] }}
      transition={{ duration: 0.8, times: [0, 0.4, 1] }}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '120px',
        zIndex: 9998,
        pointerEvents: 'none',
      }}
    >
      ⭐
    </motion.div>
  );
}

const celebrationConfig = {
  badge: {
    emoji: '🏆',
    title: 'Badge Earned!',
    subtitle: 'Keep up the great work!',
  },
  streak: {
    emoji: '🔥',
    title: 'Streak Extended!',
    subtitle: 'You\'re on fire!',
  },
  milestone: {
    emoji: '🎯',
    title: 'Milestone Reached!',
    subtitle: 'Amazing progress!',
  },
  completion: {
    emoji: '✅',
    title: 'Task Complete!',
    subtitle: 'Great job!',
  },
};

export default function Celebration({ show, type, message, onComplete }: CelebrationProps) {
  const [confettiPieces, setConfettiPieces] = useState<number[]>([]);
  const config = celebrationConfig[type];

  useEffect(() => {
    if (show) {
      setConfettiPieces(Array.from({ length: 30 }, (_, i) => i));
      const timer = setTimeout(() => {
        setConfettiPieces([]);
        onComplete?.();
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setConfettiPieces([]);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <>
          {confettiPieces.map((i) => (
            <Confetti key={i} delay={i * 0.05} />
          ))}
          
          {type === 'badge' && <StarBurst />}
          
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: -50 }}
            transition={{ 
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px 48px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              zIndex: 9999,
              textAlign: 'center',
            }}
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0],
              }}
              transition={{ 
                duration: 0.5,
                repeat: 2,
              }}
              style={{ fontSize: '64px', marginBottom: '16px' }}
            >
              {config.emoji}
            </motion.div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 700, 
              color: '#003B71',
              margin: 0,
              marginBottom: '8px',
            }}>
              {config.title}
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: '#6B7280',
              margin: 0,
            }}>
              {message || config.subtitle}
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function AchievementToast({ 
  badge, 
  onClose 
}: { 
  badge: { type: string; label: string; emoji: string }; 
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '16px 24px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        border: '2px solid #FFD700',
      }}
    >
      <span style={{ fontSize: '32px' }}>{badge.emoji}</span>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#003B71' }}>
          {badge.label} Badge Earned!
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280' }}>
          Keep up the excellent work
        </div>
      </div>
    </motion.div>
  );
}
