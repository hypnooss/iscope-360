import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "ghost";
};

export function Button({
  children,
  className = "",
  size = "md",
  variant = "default",
  ...props
}: ButtonProps) {
  const sizes = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2",
    lg: "px-6 py-3 text-lg",
  };

  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-white text-white bg-transparent hover:bg-white/10",
    ghost: "text-white bg-transparent hover:bg-white/10",
  };

  return (
    <button
      className={`rounded transition ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}