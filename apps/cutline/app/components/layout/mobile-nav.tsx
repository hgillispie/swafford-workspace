import { createContext, useContext } from "react";

export const MobileNavContext = createContext<{ open: () => void } | null>(
  null,
);

export function useMobileNav() {
  return useContext(MobileNavContext);
}
