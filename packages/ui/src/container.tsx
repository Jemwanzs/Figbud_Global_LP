import type { ComponentPropsWithoutRef, ElementType } from "react";

import { cn } from "./cn";

type ContainerProps<T extends ElementType> = {
  as?: T;
  /** `wide` for hero and showcase compositions, `prose` for reading width. */
  size?: "default" | "wide" | "prose";
} & ComponentPropsWithoutRef<T>;

const sizes = {
  default: "max-w-[80rem]",
  wide: "max-w-[92rem]",
  prose: "max-w-[46rem]",
};

/** Responsive page gutter: 20px mobile → 32–40px tablet → 64px desktop. */
export function Container<T extends ElementType = "div">({
  as,
  size = "default",
  className,
  ...props
}: ContainerProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn("mx-auto w-full px-5 sm:px-8 md:px-10 lg:px-16", sizes[size], className)}
      {...props}
    />
  );
}
