import { createContext, useContext, type ReactNode } from "react";
import type { DataCache } from "./DataCache";
import type { DiffEngine } from "./DiffEngine";
import type { WriteScheduler } from "./WriteScheduler";

export interface DataLayerContextValue {
  cache: DataCache;
  diff: DiffEngine;
  writer: WriteScheduler;
}

const DataLayerContext = createContext<DataLayerContextValue | null>(null);

export function DataLayerProvider({
  value,
  children,
}: {
  value: DataLayerContextValue;
  children: ReactNode;
}) {
  return (
    <DataLayerContext.Provider value={value}>
      {children}
    </DataLayerContext.Provider>
  );
}

/**
 * Hook to access the data layer (cache + diff + writer).
 * Returns null if not inside a DataLayerProvider (fallback to legacy IPC pattern).
 */
export function useDataLayer(): DataLayerContextValue | null {
  return useContext(DataLayerContext);
}

/**
 * Hook that requires the data layer — throws if not available.
 * Use in components that absolutely need the cached data pattern.
 */
export function useRequiredDataLayer(): DataLayerContextValue {
  const ctx = useContext(DataLayerContext);
  if (!ctx) {
    throw new Error("useRequiredDataLayer must be used inside a DataLayerProvider");
  }
  return ctx;
}
