// Input component extends from shadcnui - https://ui.shadcn.com/docs/components/input
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useMotionTemplate, useMotionValue, motion } from "motion/react";
import { useTheme } from "@/context/ThemeContext";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, containerClassName, type, ...props }, ref) => {
    const { colors } = useTheme();
    const radius = 100; // change this to increase the rdaius of the hover effect
    const [visible, setVisible] = React.useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({
      currentTarget,
      clientX,
      clientY,
    }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();

      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }
    return (
      <motion.div
        style={{
          background: useMotionTemplate`
        radial-gradient(
          ${visible ? radius + "px" : "0px"} circle at ${mouseX}px ${mouseY}px,
          ${colors.inputFocus},
          transparent 80%
        )
      `,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={cn(
          "group/input w-full rounded-lg p-[2px] transition duration-300",
          containerClassName,
        )}
      >
        <input
          type={type}
          className={cn(
            "shadow-input flex h-10 w-full rounded-md border-none px-3 py-2 text-sm transition duration-400 group-hover/input:shadow-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:opacity-70 focus-visible:ring-[2px] focus-visible:ring-[var(--t-inputFocus)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          style={{
            background: colors.inputBg,
            color: colors.pageFg,
            boxShadow:
              colors.colorScheme === "dark"
                ? `0px 0px 0px 1px ${colors.inputBorder}`
                : undefined,
          }}
          ref={ref}
          {...props}
        />
      </motion.div>
    );
  },
);
Input.displayName = "Input";

export { Input };
