// Adapted from T3 Code's Base UI button. See THIRD_PARTY_NOTICES.md.
import { Button as Primitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const variants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border text-sm font-medium outline-none cursor-pointer disabled:cursor-default disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        primary: "border-transparent bg-[var(--accent)] text-white",
        secondary:
          "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
        ghost: "border-transparent hover:bg-[var(--message)]",
      },
      size: {
        default: "min-h-9 px-3",
        icon: "size-9",
        small: "min-h-7 px-2 text-xs",
      },
    },
    defaultVariants: { tone: "secondary", size: "default" },
  },
);

export function Button({
  className,
  tone,
  size,
  ...props
}: Primitive.Props & VariantProps<typeof variants>) {
  return (
    <Primitive
      className={twMerge(clsx(variants({ tone, size }), className))}
      {...props}
    />
  );
}
