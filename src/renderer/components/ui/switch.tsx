import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../../app/lib/utils";

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
        ref={ref}
        className={cn(
            "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors duration-150 ease-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-input",
            className
        )}
        {...props}
    >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-[1.125rem] w-[1.125rem] rounded-full shadow-sm ring-0 transition-transform duration-150 ease-pop data-[state=checked]:translate-x-[1.0625rem] data-[state=checked]:bg-foreground data-[state=unchecked]:translate-x-px data-[state=unchecked]:bg-muted-foreground" />
    </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
