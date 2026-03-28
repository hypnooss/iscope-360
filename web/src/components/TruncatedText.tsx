import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TruncatedTextProps = {
  text: string;
  className?: string;
  /** Tailwind max-w-* helper (e.g. "max-w-[220px]") */
  maxWidthClassName?: string;
};

/**
 * Displays a single-line truncated text (…)
 * and reveals the full content on hover/focus via tooltip.
 */
export function TruncatedText({ text, className, maxWidthClassName }: TruncatedTextProps) {
  const safeText = text?.trim() ? text : "N/A";

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "inline-block align-middle truncate",
              maxWidthClassName || "max-w-[18rem]",
              className,
            )}
            title={safeText}
          >
            {safeText}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm break-words">
          {safeText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
