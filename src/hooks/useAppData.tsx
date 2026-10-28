import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/errors";
import { subscribeGroups } from "@/services/groups";
import { DEFAULT_SETTINGS, subscribeSettings } from "@/services/settings";
import type { Group, InstitutionSettings } from "@/types";

interface AppData {
  groups: Group[];
  groupsLoading: boolean;
  groupById: Map<string, Group>;
  settings: InstitutionSettings;
  settingsExists: boolean;
  error: string | null;
}

const Ctx = createContext<AppData | null>(null);

/** Una sola suscripción a grupos y configuración para toda la app. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [settings, setSettings] = useState<InstitutionSettings>(DEFAULT_SETTINGS);
  const [settingsExists, setSettingsExists] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeGroups(
      (g) => {
        setGroups(g);
        setGroupsLoading(false);
      },
      (e) => {
        setError(errorMessage(e));
        setGroupsLoading(false);
      },
    );
    const u2 = subscribeSettings(
      (s, exists) => {
        setSettings(s);
        setSettingsExists(exists);
      },
      (e) => setError(errorMessage(e)),
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  const value = useMemo(
    () => ({ groups, groupsLoading, groupById: new Map(groups.map((g) => [g.id, g])), settings, settingsExists, error }),
    [groups, groupsLoading, settings, settingsExists, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppData fuera de AppDataProvider");
  return c;
}
