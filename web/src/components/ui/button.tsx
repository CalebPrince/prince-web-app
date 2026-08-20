import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva(
  "group relative inline-flex origin-bottom items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] [transform:perspective(600px)] transition-[background-color,border-color,color,transform,box-shadow] duration-300 ease-out hover:[transform:perspective(600px)_translateY(-3px)_rotateX(14deg)] hover:shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)] active:duration-150 active:[transform:perspective(600px)_translateY(1px)_rotateX(-6deg)_scale(0.97)] motion-reduce:transition-none motion-reduce:hover:[transform:none] motion-reduce:active:[transform:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // Signature princecaleb.dev green pill: mint fill, near-black ink, green glow
        primary: "bg-accent text-on-accent hover:bg-accent-strong hover:glow-green",
        default: "bg-accent text-on-accent hover:bg-accent-strong hover:glow-green",
        secondary:
          "border border-hairline-strong bg-white/[0.02] text-text hover:border-accent/60 hover:text-accent",
        outline:
          "border border-hairline-strong bg-transparent text-text hover:border-accent/60 hover:text-accent",
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
