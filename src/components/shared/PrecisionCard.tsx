import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface PrecisionCardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'light' | 'obsidian' | 'glass';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hover?: boolean;
    onClick?: () => void;
}

export const PrecisionCard: React.FC<PrecisionCardProps> = ({
    children,
    className,
    variant = 'light',
    padding = 'md',
    hover = false,
    onClick
}) => {
    const variants = {
        light: 'precision-glass',
        obsidian: 'obsidian-glass',
        glass: 'backdrop-blur-xl border border-white/10 bg-white/5 shadow-sm',
    };

    const paddings = {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-8',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={hover ? { y: -4, boxShadow: '0 12px 40px -12px rgba(0,0,0,0.1)' } : undefined}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            onClick={onClick}
            className={cn(
                'rounded-[28px] overflow-hidden transition-shadow duration-300',
                variants[variant],
                paddings[padding],
                onClick && 'cursor-pointer',
                className
            )}
        >
            {children}
        </motion.div>
    );
};
