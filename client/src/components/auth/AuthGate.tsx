import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuthMe } from "@/lib/api";
import Login from "@/pages/Login";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useAuthMe();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}

