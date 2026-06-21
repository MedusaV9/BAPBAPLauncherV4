import { motion, useReducedMotion } from "motion/react";
import { useSteamPersonaName } from "../query/hooks";

const EASE = [0.16, 1, 0.3, 1] as const;

export function StartupSplash() {
    const { data: persona, isPending } = useSteamPersonaName();
    const reduceMotion = useReducedMotion();
    const name = persona?.trim() || "Player";
    const chars = [...name];

    return (
        <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
            <div className="splash-spot splash-spot-magenta" />
            <div className="splash-spot splash-spot-purple" />
            <div className="splash-spot splash-spot-cyan" />

            <div className="relative z-10 flex flex-col items-center px-8 text-center">
                <motion.p
                    className="font-body mb-3 text-sm font-medium uppercase tracking-[0.4em] text-muted-foreground"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                >
                    Hello
                </motion.p>
                <h1
                    className="font-display text-5xl leading-none text-foreground sm:text-7xl md:text-8xl"
                    aria-label={`Hello ${name}`}
                >
                    {!isPending && chars.map((ch, i) => (
                        <motion.span
                            key={i}
                            aria-hidden
                            className="inline-block"
                            initial={reduceMotion ? false : { opacity: 0, y: "0.55em" }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + i * 0.04, duration: 0.6, ease: EASE }}
                        >
                            {ch === " " ? " " : ch}
                        </motion.span>
                    ))}
                </h1>
            </div>
        </div>
    );
}
