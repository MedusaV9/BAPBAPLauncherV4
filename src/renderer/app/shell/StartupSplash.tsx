import { motion, useReducedMotion } from "motion/react";
import logoWordmark from "../../assets/brand/BAPBAP_Logo_Horizontal_White.svg";

const EASE = [0.16, 1, 0.3, 1] as const;

export function StartupSplash() {
    const reduceMotion = useReducedMotion();

    return (
        <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
            <div className="relative z-10 flex flex-col items-center gap-7 px-8">
                <motion.img
                    src={logoWordmark}
                    alt="BAPBAP"
                    className="h-12 w-auto select-none sm:h-16 md:h-20"
                    draggable={false}
                    initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.7, ease: EASE }}
                />
                <motion.div
                    className="flex items-center gap-2"
                    aria-label="Loading"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
                >
                    <span className="splash-loader-dot" />
                    <span className="splash-loader-dot" style={{ animationDelay: "0.16s" }} />
                    <span className="splash-loader-dot" style={{ animationDelay: "0.32s" }} />
                </motion.div>
            </div>
        </div>
    );
}
