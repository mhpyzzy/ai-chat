import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      type={type}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "dark:bg-input/30 dark:selection:bg-primary dark:hover:bg-input/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
