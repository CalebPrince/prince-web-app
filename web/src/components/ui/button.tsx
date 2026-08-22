import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva(
  // tilt-3d (globals.css) owns the resting tilt, the hover rotate-up, the press
  // and the reduced-motion opt-out, so every control on the site shares one
  // angle instead of each spelling out its own perspective transform. It sits
  // on the variants rather than here because ghost is a text button - a slab
  // of ground shadow under transparent copy reads as a rendering bug.
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // Signature princecaleb.dev green pill: mint fill, near-black ink, green glow
        primary: "tilt-3d tilt-glow bg-accent text-on-accent hover:bg-accent-strong",
        default: "tilt-3d tilt-glow bg-accent text-on-accent hover:bg-accent-strong",
        secondary:
          "tilt-3d border border-hairline-strong bg-bg text-text hover:border-accent/60 hover:text-accent",
        outline:
          "tilt-3d border border-hairline-strong bg-bg text-text hover:border-accent/60 hover:text-accent",
        ghost: "bg-transparent text-text-2 hover:text-accent",
      },
      size: {
        default: "h-11 px-6 text-sm",
        sm: "h-9 px-4 text-[0.8rem]",
        lg: "h-13 px-8 text-[0.95rem]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
