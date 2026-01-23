import React, { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { StopCircle } from 'lucide-react';

const THINKING_STATES = ['SCANNING LINES', 'CHECKING TRENDS', 'VERIFYING SPLITS', 'GRADING EDGE'] as const;

interface ThinkingPillProps {
    onStop?: () => void;
    status?: 'thinking' | 'streaming' | 'grounding';
}

/**
 * Neural Pulse v15.8 - Premium "Sentient Organelle" Status Indicator
 * 
 * A floating status pill with morphing equalizer bars and ambient aura
 * that provides visual proof-of-work during AI reasoning cycles.
 */
export const ThinkingPill: React.FC<ThinkingPillProps> = memo(({ onStop, status = 'thinking' }) => {
    const [stateIndex, setStateIndex] = useState(0);

    useEffect(() => {
        if (status !== 'thinking') return;
        const interval = setInterval(() => setStateIndex(i => (i + 1) % THINKING_STATES.length), 2000);
        return () => clearInterval(interval);
    }, [status]);

    const displayText = status === 'streaming'
        ? 'STREAMING'
        : status === 'grounding'
            ? 'SOURCING INTEL'
            : THINKING_STATES[stateIndex];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="relative flex items-center gap-3 pl-4 pr-3 py-2.5 
                 backdrop-blur-xl bg-black/70 border border-white/[0.08]
                 shadow-[0_8px_32px_rgba(0,0,0,0.8),0_0_30px_rgba(99,102,241,0.1)] 
                 rounded-full overflow-hidden"
        >
            {/* Ambient Aura - Breathing indigo-violet radial pulse */}
            <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/10 to-violet-400/10 blur-xl"
            />

            {/* Morphing Equalizer Bars */}
            <div className="relative flex gap-[3px] items-end h-4">
                <motion.div
                    animate={{ height: ['40%', '100%', '60%', '80%', '40%'] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0, ease: 'easeInOut' }}
                    className="w-[3px] bg-gradient-to-t from-indigo-500 to-violet-400 rounded-full"
                />
                <motion.div
                    animate={{ height: ['60%', '100%', '40%', '90%', '60%'] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: 'easeInOut' }}
                    className="w-[3px] bg-gradient-to-t from-indigo-500 to-violet-400 rounded-full"
                />
                <motion.div
                    animate={{ height: ['40%', '80%', '100%', '60%', '40%'] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: 'easeInOut' }}
                    className="w-[3px] bg-gradient-to-t from-indigo-500 to-violet-400 rounded-full"
                />
            </div>

            {/* Cognitive State Label (v16.2: No AnimatePresence to prevent mount deadlock) */}
            <motion.span
                key={displayText}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative text-[11px] font-mono font-medium tracking-[0.15em] text-white/90 uppercase whitespace-nowrap"
            >
                {displayText}
            </motion.span>

            {onStop && (
                <button
                    type="button"
                    onClick={onStop}
                    className="relative ml-1 p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    aria-label="Stop"
                >
                    <StopCircle size={14} />
                </button>
            )}
        </motion.div>
    );
});

ThinkingPill.displayName = 'ThinkingPill';

export default ThinkingPill;
