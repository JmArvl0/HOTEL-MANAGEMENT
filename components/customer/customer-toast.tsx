"use client";

import { createContext, useContext } from "react";
import { ToastStack, useToasts, type ToastController } from "@/components/ui/toast-stack";

// Shared transient-toast surface for the customer portal: one ToastStack
// mounted in the customer shell, pushed to from any child (e.g. the
// Request-a-Change modal) without threading controllers through props.
const CustomerToastContext = createContext<ToastController | null>(null);

export function CustomerToastProvider({ children }: { children: React.ReactNode }) {
  const controller = useToasts();
  return (
    <CustomerToastContext.Provider value={controller}>
      {children}
      <ToastStack controller={controller} />
    </CustomerToastContext.Provider>
  );
}

export function useCustomerToast(): ToastController["push"] {
  const controller = useContext(CustomerToastContext);
  return controller?.push ?? (() => {});
}
