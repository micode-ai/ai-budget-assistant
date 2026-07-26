// Import the prop type explicitly rather than reaching for the ambient
// `React.*` global. Two copies of @types/react exist in this install and cannot
// be deduped (radix-ui declares `peerOptional @types/react-dom: "*"`, so npm
// always nests the newest 19.2.x under apps/admin, while the root sits on the
// 19.1.x line that react-native pins for apps/mobile). The global React
// namespace binds to one copy while the react-jsx runtime resolves the other,
// so an ambient `React.ComponentProps<"div">` produced a `ref` type that was
// "unrelated" to the one the intrinsic <div> expected. An explicit import
// resolves both through this file's own module resolution, giving one identity.
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
