"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import FinancePanel from "@/features/expenses/components/finances-panel";

export default function DashboardPage() {
    const [authenticated, setAuthenticated] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                router.push("/login");
            } else {
                setAuthenticated(true);
            }
        });
    }, []);

    if (!authenticated) {
        return (
            <div style={{
                minHeight: "100vh", display: "flex", alignItems: "center",
                justifyContent: "center", background: "#f3f4f6",
            }}>
                <p style={{ color: "#6b7280" }}>Loading...</p>
            </div>
        );
    }

    return <FinancePanel />;
}