// Shared motion vocabulary — one physical language across the launcher.
export const EASE_POP = [0.22, 1, 0.36, 1] as const;

export const SPRING = {
    ui: { type: "spring", stiffness: 500, damping: 38 },
    snappy: { type: "spring", stiffness: 380, damping: 32 },
    pop: { type: "spring", stiffness: 240, damping: 18 },
} as const;

export const VIEWPORT = { once: true, margin: "-12%" } as const;

// Parent/child reveal variants (use `custom={i}` for index-based stagger).
export const containerVariants = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.07, delayChildren: 0.05 },
    },
};

export const itemUp = {
    hidden: { opacity: 0, y: 22 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: EASE_POP },
    },
};
